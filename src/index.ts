/**
 * Design-to-Code 主入口
 */

import { createVisionClient, createCodeClient } from './llm/client.js';
import { STRUCTURE_ANALYSIS_PROMPT, buildStructureAnalysisMessage } from './prompts/structure-analysis.js';
import { buildCodeGenerationPrompt, buildRepairPrompt } from './prompts/code-generation.js';
import { VisualValidator } from './validator/visual-validator.js';
import { TokenMapper } from './codegen/token-mapper.js';
import { parsePageStructure } from './structure-parser.js';
import { buildDirectGenerationPrompt, buildVisualPatchPrompt } from './prompts/direct-generation.js';
import { applyCodeEdits, parseCodeEdits } from './codegen/patch-applier.js';
import { runAutoCorrection } from './validator/auto-corrector.js';
import sharp from 'sharp';
import { buildRegionPlanningPrompt, parseRegionPlan } from './prompts/region-planning.js';
import { assembleHtmlDocument, buildRegionGenerationPrompt } from './segmented-generator.js';
import { buildTextExtractionPrompt, parseVisibleTexts } from './prompts/text-extraction.js';
import { calculateTextCoverage } from './validator/text-coverage.js';
import { passesQualityGate } from './validator/quality-gate.js';
import { buildAssetDetectionPrompt, parseAssetRegions } from './prompts/asset-detection.js';
import { extractImageAssets } from './assets/asset-extractor.js';
import { getDefaultModelConfig, getDefaultValidationConfig, getDefaultCodegenOptions } from './config.js';
import { assertValidCodegenOptions } from './runtime/codegen-options.js';
import { normalizeGeneratedAssets } from './runtime/asset-files.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type {
  DesignToCodeRequest,
  DesignToCodeResult,
  PageStructure,
  GeneratedCode,
  ValidationResult,
  CodegenOptions,
  GeneratedAsset,
  ConversionProgressEvent,
} from './types.js';

// 导出所有模块
export * from './types.js';
export * from './config.js';
export { createVisionClient, createCodeClient } from './llm/client.js';
export { VisualValidator } from './validator/visual-validator.js';
export { TokenMapper } from './codegen/token-mapper.js';
export { ComponentMapper } from './codegen/component-mapper.js';
export { parsePageStructure } from './structure-parser.js';
export { runAutoCorrection } from './validator/auto-corrector.js';
export { extractImageAssets } from './assets/asset-extractor.js';
export { createFrameworkProjectFiles, exportFrameworkProject } from './runtime/project-scaffolder.js';
export { assertValidCodegenOptions } from './runtime/codegen-options.js';

/**
 * 设计稿转代码主类
 */
export class DesignToCode {
  private modelConfig: ReturnType<typeof getDefaultModelConfig>;
  private validationConfig: ReturnType<typeof getDefaultValidationConfig>;
  private validator: VisualValidator;

  constructor(options?: {
    modelConfig?: ReturnType<typeof getDefaultModelConfig>;
    validationConfig?: ReturnType<typeof getDefaultValidationConfig>;
  }) {
    this.modelConfig = options?.modelConfig || getDefaultModelConfig();
    this.validationConfig = options?.validationConfig || getDefaultValidationConfig();
    this.validator = new VisualValidator(this.validationConfig);
  }

  private emitProgress(
    request: DesignToCodeRequest,
    event: Omit<ConversionProgressEvent, 'timestamp'>
  ): void {
    request.onProgress?.({ ...event, timestamp: new Date().toISOString() });
  }

  /**
   * 分析设计稿结构
   */
  async analyzeStructure(imageBase64: string): Promise<PageStructure> {
    const visionClient = createVisionClient(this.modelConfig);

    const messages = buildStructureAnalysisMessage(imageBase64);
    const response = await visionClient.chatCompletion(messages as any, {
      temperature: 0.3,
      maxTokens: 32768,
    });

    const content = response.choices[0]?.message?.content || '';

    return parsePageStructure(content, async (invalidContent) => {
      const codeClient = createCodeClient(this.modelConfig);
      return codeClient.generateCode(
        `以下是由视觉模型生成的页面结构 JSON，但格式不完整或存在语法错误。
请修复为合法 JSON，保留已有内容，不要添加解释或 Markdown 标记。
如果末尾不完整，请补全当前字段并关闭所有数组和对象。

${invalidContent}`,
        { temperature: 0, maxTokens: 32768 }
      );
    });
  }

  private async extractVisibleTexts(imageBase64: string): Promise<string[]> {
    const content = await createVisionClient(this.modelConfig).generateWithImages(
      buildTextExtractionPrompt(),
      [imageBase64],
      { temperature: 0, maxTokens: 4096 }
    );
    return parseVisibleTexts(content);
  }

  /** 识别并裁剪可复用的图片资源。 */
  async extractAssets(imageBase64: string, outputDir: string): Promise<string[]> {
    const content = await createVisionClient(this.modelConfig).generateWithImages(
      buildAssetDetectionPrompt(),
      [imageBase64],
      { temperature: 0, maxTokens: 4096 }
    );
    const regions = parseAssetRegions(content);
    const imageBuffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    return extractImageAssets(imageBuffer, regions, outputDir);
  }

  private async prepareGeneratedAssets(imageBase64: string): Promise<GeneratedAsset[]> {
    const outputDir = await mkdtemp(join(tmpdir(), 'image2html-conversion-assets-'));
    try {
      const paths = await this.extractAssets(imageBase64, outputDir);
      const assets = await Promise.all(paths.map(async (path) => ({
        name: basename(path),
        mimeType: 'image/png',
        data: await readFile(path).then((buffer) => buffer.toString('base64')),
      })));
      return normalizeGeneratedAssets(assets);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
  private applyTextCoverage(
    validation: ValidationResult,
    originalTexts: string[],
    code: string
  ): void {
    const coverage = calculateTextCoverage(originalTexts, code);
    validation.textCoverage = coverage.coverage;
    validation.missingTexts = coverage.missing;
    if (validation.quality) {
      validation.quality.textCoverage = coverage.coverage;
      validation.passed = passesQualityGate(validation.quality, this.validationConfig);
    }
  }

  /**
   * 生成代码
   */
  async generateCode(
    structure: PageStructure,
    options: CodegenOptions,
    assets: GeneratedAsset[] = []
  ): Promise<GeneratedCode> {
    assertValidCodegenOptions(options);
    const codeClient = createCodeClient(this.modelConfig);

    const prompt = buildCodeGenerationPrompt(structure, options, assets);
    const code = await codeClient.generateCode(prompt, {
      temperature: 0.3,
      maxTokens: 16384,
    });

    const result = this.finalizeGeneratedCode(code, structure.page.title, options, structure.designTokens);
    result.assets = assets;
    return result;
  }

  /** 单次多模态直接生成，避免庞大的结构 JSON 中转。 */
  async generateDirectCode(
    imageBase64: string,
    options: CodegenOptions,
    onProgress?: (event: ConversionProgressEvent) => void,
    assets: GeneratedAsset[] = []
  ): Promise<GeneratedCode> {
    assertValidCodegenOptions(options);
    if (options.layoutMode === 'segmented' && options.framework === 'html') {
      try {
        return await this.generateSegmentedHtml(imageBase64, options, onProgress, assets);
      } catch (error) {
        console.error('[design-to-code] Segmented generation failed; using single-page generation', error);
      }
    }

    const visionClient = createVisionClient(this.modelConfig);
    let lastSnapshotLength = 0;
    let lastSnapshotAt = 0;
    const code = await visionClient.generateWithImages(
      buildDirectGenerationPrompt(options, assets),
      [imageBase64],
      {
        temperature: 0.2,
        maxTokens: 16384,
        onChunk: (fullText) => {
          const now = Date.now();
          if (fullText.length - lastSnapshotLength < 1000 && now - lastSnapshotAt < 1000) return;
          lastSnapshotLength = fullText.length;
          lastSnapshotAt = now;
          onProgress?.({
            stage: 'preview',
            message: '正在生成代码预览',
            timestamp: new Date().toISOString(),
            chars: fullText.length,
            codeSnapshot: fullText,
          });
        },
      }
    );

    onProgress?.({
      stage: 'preview',
      message: '首版代码已生成',
      timestamp: new Date().toISOString(),
      chars: code.length,
      codeSnapshot: code,
    });

    const result = this.finalizeGeneratedCode(code, 'GeneratedPage', options);
    result.assets = assets;
    return result;
  }

  private async generateSegmentedHtml(
    imageBase64: string,
    options: CodegenOptions,
    onProgress?: (event: ConversionProgressEvent) => void,
    assets: GeneratedAsset[] = []
  ): Promise<GeneratedCode> {
    const imageBuffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1440;
    const height = metadata.height || 900;
    const visionClient = createVisionClient(this.modelConfig);

    onProgress?.({
      stage: 'analyzing',
      message: '正在生成轻量区域规划',
      timestamp: new Date().toISOString(),
    });
    const planning = await visionClient.chatCompletion([
      {
        role: 'user',
        content: [
          { type: 'text', text: buildRegionPlanningPrompt() },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      },
    ], { temperature: 0.1, maxTokens: 4096 });
    const regions = parseRegionPlan(planning.choices[0]?.message?.content || '')
      .map((region) => ({
        ...region,
        startY: Math.min(region.startY, height - 1),
        endY: Math.min(region.endY, height),
      }))
      .filter((region) => region.endY > region.startY);

    const fragments = await Promise.all(regions.map(async (region) => {
      const crop = await sharp(imageBuffer)
        .extract({
          left: 0,
          top: region.startY,
          width,
          height: region.endY - region.startY,
        })
        .png()
        .toBuffer();
      const code = await visionClient.generateWithImages(
        buildRegionGenerationPrompt(region, options, width, height, assets),
        [`data:image/png;base64,${crop.toString('base64')}`],
        { temperature: 0.2, maxTokens: 8192 }
      );
      onProgress?.({
        stage: 'generating',
        message: `区域 ${region.id} 已生成`,
        timestamp: new Date().toISOString(),
      });
      return code.trim().replace(/^```\w*\n/, '').replace(/\n```$/, '');
    }));

    const assembled = assembleHtmlDocument('GeneratedPage', fragments);
    onProgress?.({
      stage: 'preview',
      message: '分段页面已组合',
      timestamp: new Date().toISOString(),
      chars: assembled.length,
      codeSnapshot: assembled,
    });

    const result = this.finalizeGeneratedCode(assembled, 'GeneratedPage', options);
    result.modelCalls = regions.length + 1;
    result.assets = assets;
    return result;
  }

  private finalizeGeneratedCode(
    rawCode: string,
    title: string,
    options: CodegenOptions,
    tokens?: PageStructure['designTokens']
  ): GeneratedCode {
    let cleanCode = rawCode.trim();
    if (cleanCode.startsWith('```')) {
      cleanCode = cleanCode.replace(/^```\w*\n/, '').replace(/\n```$/, '');
    }

    if (tokens && options.framework === 'html') {
      cleanCode = new TokenMapper(tokens).mapCode(cleanCode);
    }

    // 提取组件名和导入
    const components = this.extractComponents(cleanCode);
    const imports = this.extractImports(cleanCode);

    // 确定文件名
    const filename = this.generateFilename(title, options.framework, options.typescript);

    return {
      code: cleanCode,
      filename,
      imports,
      components,
    };
  }

  /**
   * 校验生成结果
   */
  async validate(
    originalImageBuffer: Buffer,
    generatedCode: GeneratedCode,
    targetOptions?: CodegenOptions
  ): Promise<ValidationResult> {
    return this.validator.validate(originalImageBuffer, generatedCode, {
      captureAllViewports: true,
      codegenOptions: targetOptions,
    });
  }

  /**
   * 修复代码
   */
  async repairCode(
    originalStructure: PageStructure,
    currentCode: string,
    diffRegions: Array<{ type: string; diffPercentage: number }>
  ): Promise<string> {
    const codeClient = createCodeClient(this.modelConfig);

    const prompt = buildRepairPrompt(originalStructure, currentCode, diffRegions);
    const repairedCode = await codeClient.generateCode(prompt, {
      temperature: 0.3,
      maxTokens: 16384,
    });

    // 清理代码
    let cleanCode = repairedCode.trim();
    if (cleanCode.startsWith('```')) {
      cleanCode = cleanCode.replace(/^```\w*\n/, '').replace(/\n```$/, '');
    }

    return cleanCode;
  }

  private async repairWithVision(
    imageBase64: string,
    currentCode: string,
    validation: ValidationResult
  ): Promise<string> {
    const images = [imageBase64];
    if (validation.screenshots.desktop) images.push(validation.screenshots.desktop);
    if (validation.diffImage) images.push(validation.diffImage);

    const repaired = await createVisionClient(this.modelConfig).generateWithImages(
      buildVisualPatchPrompt({
        currentCode,
        suggestions: validation.suggestions,
        regions: validation.regions.map((region) => ({
          type: region.type,
          diffPercentage: region.diffPercentage,
        })),
      }),
      images,
      { temperature: 0.1, maxTokens: 16384 }
    );

    try {
      const edits = parseCodeEdits(repaired);
      return applyCodeEdits(currentCode, edits).code;
    } catch (error) {
      console.error('[design-to-code] Invalid visual patch; keeping current version', error);
      return currentCode;
    }
  }

  /**
   * 完整转换流程
   */
  async convert(request: DesignToCodeRequest): Promise<DesignToCodeResult> {
    const startedAt = Date.now();
    let analysisMs = 0;
    let generationMs = 0;
    let validationMs = 0;
    let repairMs = 0;
    let modelCalls = 0;
    let repairIterations = 0;
    let qualityHistory: DesignToCodeResult['qualityHistory'];
    let originalTexts: string[] | undefined;
    let code: GeneratedCode | undefined;
    this.emitProgress(request, { stage: 'reading', message: '正在读取设计稿' });

    try {
      assertValidCodegenOptions(request.options);
      // 1. 准备图片数据
      let imageBase64: string;
      let imageBuffer: Buffer;

      if (request.image.type === 'base64') {
        imageBase64 = request.image.source;
        imageBuffer = Buffer.from(
          imageBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
      } else {
        // 从文件读取
        const fs = await import('fs/promises');
        imageBuffer = await fs.readFile(request.image.source);
        imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      }

      let structure: PageStructure | undefined;
      let assets: GeneratedAsset[] = [];
      if (request.options.assetMode === 'extract') {
        this.emitProgress(request, { stage: 'analyzing', message: '正在提取可复用图片资源' });
        const assetStartedAt = Date.now();
        assets = await this.prepareGeneratedAssets(imageBase64);
        analysisMs += Date.now() - assetStartedAt;
        modelCalls += 1;
      }

      const generationStartedAt = Date.now();

      if (request.options.pipeline === 'structured') {
        this.emitProgress(request, { stage: 'analyzing', message: '正在分析设计结构' });
        const analysisStartedAt = Date.now();
        structure = await this.analyzeStructure(imageBase64);
        analysisMs += Date.now() - analysisStartedAt;
        modelCalls += 1;

        console.log('Generating code from structure...');
        code = await this.generateCode(structure, request.options, assets);
        modelCalls += 1;
      } else {
        this.emitProgress(request, { stage: 'generating', message: '正在直接生成代码' });
        code = await this.generateDirectCode(imageBase64, request.options, request.onProgress, assets);
        modelCalls += code.modelCalls ?? 1;
      }
      code.assets = assets;
      generationMs = Date.now() - generationStartedAt;

      // 4. 校验（可选）
      let validation: ValidationResult | undefined;
      if (request.validationConfig) {
        this.emitProgress(request, { stage: 'validating', message: '正在执行视觉校验' });
        const validationStartedAt = Date.now();
        validation = await this.validate(imageBuffer, code, request.options);
        validationMs += Date.now() - validationStartedAt;

        if (this.validationConfig.checkTextCoverage) {
          this.emitProgress(request, { stage: 'validating', message: '正在检查文字完整性' });
          const textStartedAt = Date.now();
          originalTexts = await this.extractVisibleTexts(imageBase64);
          modelCalls += 1;
          this.applyTextCoverage(validation, originalTexts, code.code);
          validationMs += Date.now() - textStartedAt;
        }

        const qualityBudget = { fast: 0, balanced: 2, precision: 4 };
        const requestedBudget = qualityBudget[request.options.qualityMode || 'balanced'];
        const maxIterations = Math.min(
          requestedBudget,
          Math.max(0, this.validationConfig.maxRetryCount)
        );

        if (!validation.passed && maxIterations > 0) {
          this.emitProgress(request, { stage: 'repairing', message: '正在自动修复视觉差异' });
          const repairStartedAt = Date.now();
          const corrected = await runAutoCorrection({
            initialCode: code.code,
            initialValidation: validation,
            maxIterations,
            score: (result) => result.quality?.qualityScore ?? result.similarity,
            repair: async (currentCode, currentValidation) => {
              modelCalls += 1;
              return this.repairWithVision(imageBase64, currentCode, currentValidation);
            },
            validate: async (candidateCode) => {
              const candidateStartedAt = Date.now();
              const result = await this.validate(imageBuffer, { ...(code as GeneratedCode), code: candidateCode }, request.options);
              validationMs += Date.now() - candidateStartedAt;
              return result;
            },
          });
          code.code = corrected.code;
          validation = corrected.validation;
          repairIterations = corrected.iterations;
          qualityHistory = corrected.history;
          repairMs = Date.now() - repairStartedAt;
        }

        if (originalTexts) this.applyTextCoverage(validation, originalTexts, code.code);
      }

      this.emitProgress(request, { stage: 'completed', message: '转换与校验已完成' });

      return {
        code,
        structure,
        validation,
        qualityHistory,
        metrics: {
          analysisMs,
          generationMs,
          validationMs,
          repairMs,
          totalMs: Date.now() - startedAt,
          modelCalls,
          repairIterations,
        },
        success: true,
      };
    } catch (error) {
      this.emitProgress(request, {
        stage: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        code: code || { code: '', filename: '', imports: [], components: [] },
        metrics: {
          analysisMs,
          generationMs,
          validationMs,
          repairMs,
          totalMs: Date.now() - startedAt,
          modelCalls,
          repairIterations,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 提取组件名
   */
  private extractComponents(code: string): string[] {
    const componentPattern = /(?:function|const)\s+([A-Z][A-Za-z0-9]*)\s*(?:\(|=)/g;
    const matches = [...code.matchAll(componentPattern)];
    return [...new Set(matches.map((m) => m[1]))];
  }

  /**
   * 提取导入语句
   */
  private extractImports(code: string): string[] {
    const importPattern = /import\s+.*?from\s+['"](.*?)['"]/g;
    const matches = [...code.matchAll(importPattern)];
    return [...new Set(matches.map((m) => m[1]))];
  }

  /**
   * 生成文件名
   */
  private generateFilename(title: string, framework: string, typescript: boolean): string {
    // 转换为 PascalCase
    const pascalCase = title
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    const extension = framework === 'react' ? (typescript ? 'tsx' : 'jsx') : framework === 'vue' ? 'vue' : 'html';

    return `${pascalCase || 'Component'}.${extension}`;
  }

  /**
   * 关闭资源
   */
  async close(): Promise<void> {
    await this.validator.close();
  }
}

/**
 * 快捷转换函数
 */
export async function designToCode(
  imagePath: string,
  options?: Partial<ReturnType<typeof getDefaultCodegenOptions>>
): Promise<DesignToCodeResult> {
  const d2c = new DesignToCode();

  try {
    const result = await d2c.convert({
      image: {
        source: imagePath,
        type: 'path',
      },
      options: {
        ...getDefaultCodegenOptions(),
        ...options,
      },
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
    });

    return result;
  } finally {
    await d2c.close();
  }
}
