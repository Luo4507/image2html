/**
 * Design-to-Code 主入口
 */

import { createVisionClient, createCodeClient } from './llm/client.js';
import { STRUCTURE_ANALYSIS_PROMPT, buildStructureAnalysisMessage } from './prompts/structure-analysis.js';
import { buildCodeGenerationPrompt, buildRepairPrompt } from './prompts/code-generation.js';
import { VisualValidator } from './validator/visual-validator.js';
import { TokenMapper } from './codegen/token-mapper.js';
import { ComponentMapper } from './codegen/component-mapper.js';
import { getDefaultModelConfig, getDefaultValidationConfig, getDefaultCodegenOptions } from './config.js';
import type {
  DesignToCodeRequest,
  DesignToCodeResult,
  PageStructure,
  GeneratedCode,
  ValidationResult,
} from './types.js';

// 导出所有模块
export * from './types.js';
export * from './config.js';
export { createVisionClient, createCodeClient } from './llm/client.js';
export { VisualValidator } from './validator/visual-validator.js';
export { TokenMapper } from './codegen/token-mapper.js';
export { ComponentMapper } from './codegen/component-mapper.js';

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

    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from vision model response');
    }

    return JSON.parse(jsonMatch[0]) as PageStructure;
  }

  /**
   * 生成代码
   */
  async generateCode(
    structure: PageStructure,
    options: ReturnType<typeof getDefaultCodegenOptions>
  ): Promise<GeneratedCode> {
    const codeClient = createCodeClient(this.modelConfig);

    const prompt = buildCodeGenerationPrompt(structure, options);
    const code = await codeClient.generateCode(prompt, {
      temperature: 0.3,
      maxTokens: 16384,
    });

    // 提取代码（去除 markdown 代码块标记）
    let cleanCode = code.trim();
    if (cleanCode.startsWith('```')) {
      cleanCode = cleanCode.replace(/^```\w*\n/, '').replace(/\n```$/, '');
    }

    // 后处理：Token 映射
    const tokenMapper = new TokenMapper(structure.designTokens);
    cleanCode = tokenMapper.mapCode(cleanCode);

    // 后处理：组件映射
    const componentMapper = new ComponentMapper(options.componentLibrary);
    cleanCode = componentMapper.mapComponents(cleanCode);

    // 提取组件名和导入
    const components = this.extractComponents(cleanCode);
    const imports = this.extractImports(cleanCode);

    // 确定文件名
    const filename = this.generateFilename(structure.page.title, options.framework);

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
    generatedCode: GeneratedCode
  ): Promise<ValidationResult> {
    return this.validator.validate(originalImageBuffer, generatedCode.code, {
      captureAllViewports: true,
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

  /**
   * 完整转换流程
   */
  async convert(request: DesignToCodeRequest): Promise<DesignToCodeResult> {
    try {
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

      // 2. 分析结构
      console.log('Analyzing design structure...');
      const structure = await this.analyzeStructure(imageBase64);

      // 3. 生成代码
      console.log('Generating code...');
      const code = await this.generateCode(structure, request.options);

      // 4. 校验（可选）
      let validation: ValidationResult | undefined;
      if (request.validationConfig) {
        console.log('Validating result...');
        validation = await this.validate(imageBuffer, code);

        // 5. 如果未通过且允许重试，尝试修复
        if (!validation.passed && this.validationConfig.maxRetryCount > 0) {
          console.log('Attempting to repair...');
          const repairedCode = await this.repairCode(
            structure,
            code.code,
            validation.regions.map((r) => ({ type: r.type, diffPercentage: r.diffPercentage }))
          );

          code.code = repairedCode;

          // 重新校验
          validation = await this.validate(imageBuffer, code);
        }
      }

      return {
        code,
        structure,
        validation,
        success: true,
      };
    } catch (error) {
      return {
        code: { code: '', filename: '', imports: [], components: [] },
        structure: {} as PageStructure,
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
  private generateFilename(title: string, framework: string): string {
    // 转换为 PascalCase
    const pascalCase = title
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    const extension = framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'html';

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
