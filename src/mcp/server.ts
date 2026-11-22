/**
 * 本地 stdio MCP Server：设计稿生成、校验、修复、结构分析与资源提取。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { DesignToCode } from '../index.js';
import { getDefaultModelConfig, getDefaultValidationConfig } from '../config.js';
import type {
  ConversionProgressEvent,
  DesignToCodeResult,
  ValidationResult,
} from '../types.js';
import { toolDefinitions } from './tool-schemas.js';
import { toolError, type MCPToolResult } from './results.js';
import { LocalConversionCache, withLocalConversionCache } from '../cache/local-conversion-cache.js';
import type { DesignToCodeRequest } from '../types.js';

export { toolError } from './results.js';
export type { MCPToolResult } from './results.js';
export type ProgressHandler = (event: ConversionProgressEvent) => void;

interface MCPServerOptions {
  converterFactory?: () => DesignToCode;
}

function textResult(text: string, structuredContent: Record<string, unknown>): MCPToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
  };
}

function fileNotFound(path: unknown): MCPToolResult {
  return toolError('FILE_NOT_FOUND', `文件不存在: ${String(path)}`);
}

export type PublicValidation = Omit<ValidationResult, 'diffImage' | 'screenshots'>;

/** Screenshots and diff images can be several megabytes; keep them out of tool JSON. */
export function toPublicValidation(validation: ValidationResult): PublicValidation {
  const { diffImage: _diffImage, screenshots: _screenshots, ...compact } = validation;
  return compact;
}

function toPublicQualityHistory(history: DesignToCodeResult['qualityHistory']) {
  return history?.map((entry) => ({
    ...entry,
    validation: toPublicValidation(entry.validation),
  }));
}

function generationData(result: DesignToCodeResult): Record<string, unknown> {
  return {
    success: true,
    code: result.code.code,
    filename: result.code.filename,
    imports: result.code.imports,
    components: result.code.components,
    validation: result.validation ? toPublicValidation(result.validation) : undefined,
    metrics: result.metrics,
  };
}

export async function createMCPServer(options: MCPServerOptions = {}) {
  const server = new Server(
    { name: 'design-to-code', version: '0.2.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    let d2c: DesignToCode | undefined;

    const onProgress: ProgressHandler = (event) => {
      void extra.sendNotification({
        method: 'notifications/message',
        params: { level: 'info', logger: 'design-to-code', data: event },
      }).catch((error) => console.error('[MCP] Failed to send progress notification', error));
    };

    try {
      d2c = options.converterFactory?.() || new DesignToCode({
        modelConfig: getDefaultModelConfig(),
        validationConfig: getDefaultValidationConfig(),
      });

      switch (name) {
        case 'generate_component':
          return await handleGenerateComponent(d2c, args, onProgress);
        case 'validate_design':
          return await handleValidateDesign(d2c, args);
        case 'repair_component':
          return await handleRepairComponent(d2c, args);
        case 'analyze_structure':
          return await handleAnalyzeStructure(d2c, args);
        case 'extract_assets':
          return await handleExtractAssets(d2c, args);
        default:
          return toolError('UNKNOWN_TOOL', `Unknown tool: ${name}`);
      }
    } catch (error) {
      return toolError('TOOL_EXECUTION_FAILED', error instanceof Error ? error.message : String(error));
    } finally {
      await d2c?.close();
    }
  });

  return server;
}

export async function handleGenerateComponent(
  d2c: DesignToCode,
  args: any = {},
  onProgress?: ProgressHandler,
): Promise<MCPToolResult> {
  const {
    image_path,
    framework = 'react',
    component_library,
    typescript = true,
    responsive = true,
    style_framework = 'tailwind',
    pipeline = 'direct',
    quality_mode = 'precision',
    layout_mode = 'single',
    asset_mode = 'none',
  } = args;
  const componentLibrary = component_library || (
    framework === 'vue' ? 'element' : framework === 'html' ? 'none' : 'antd'
  );

  if (!image_path || !existsSync(image_path)) return fileNotFound(image_path);

  console.error(`[MCP] Generating component from: ${image_path}`);
  console.error(`[MCP] Framework: ${framework}, Library: ${componentLibrary}`);

  const conversionRequest: DesignToCodeRequest = {
    image: {
      source: image_path,
      type: 'path',
      filename: basename(image_path),
    },
    options: {
      framework,
      styleFramework: style_framework,
      componentLibrary,
      typescript,
      responsive,
      accessibility: true,
      pipeline,
      qualityMode: quality_mode,
      layoutMode: layout_mode,
      assetMode: asset_mode,
    },
    modelConfig: getDefaultModelConfig(),
    validationConfig: getDefaultValidationConfig(),
    onProgress,
  };
  const result = process.env.CONVERSION_CACHE === 'true'
    ? await withLocalConversionCache(
      conversionRequest,
      new LocalConversionCache(process.env.CONVERSION_CACHE_DIR || '.cache/image2html-conversions'),
      () => d2c.convert(conversionRequest),
    )
    : await d2c.convert(conversionRequest);

  if (!result.success) {
    return toolError('GENERATION_FAILED', result.error || '代码生成失败');
  }

  const output = [
    '✅ 代码生成成功！',
    '',
    `📄 文件名: ${result.code.filename}`,
    `🧩 组件: ${result.code.components.join(', ') || '无'}`,
    `📦 依赖: ${result.code.imports.join(', ') || '无'}`,
  ];

  if (result.validation) {
    output.unshift(`📊 视觉校验: ${result.validation.similarity}% ${result.validation.passed ? '✅ 通过' : '❌ 未通过'}`, '');
    if (!result.validation.passed) {
      output.push(
        '',
        '⚠️ 差异区域:',
        ...result.validation.regions.map((region) =>
          `  - ${region.type}: ${region.diffPercentage}% 差异 (${region.x}, ${region.y})`
        ),
        '',
        '💡 修复建议:',
        ...result.validation.suggestions.map((suggestion) => `  - ${suggestion}`),
      );
    }
  }
  output.push('', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '', result.code.code);
  return textResult(output.join('\n'), generationData(result));
}

export async function handleValidateDesign(
  d2c: DesignToCode,
  args: any = {},
): Promise<MCPToolResult> {
  const {
    original_image,
    code,
    threshold = getDefaultValidationConfig().threshold,
    framework = 'html',
    style_framework = 'inline',
    component_library = 'none',
    typescript = false,
  } = args;

  if (!original_image || !existsSync(original_image)) return fileNotFound(original_image);
  console.error(`[MCP] Validating design: ${original_image}`);

  const imageBuffer = await readFile(original_image);
  const validation = await d2c.validate(imageBuffer, {
    code,
    filename: '',
    imports: [],
    components: [],
  }, {
    framework,
    styleFramework: style_framework,
    componentLibrary: component_library,
    typescript,
    responsive: true,
    accessibility: true,
  }, { threshold });

  const output = [
    `${validation.passed ? '✅' : '❌'} 视觉校验${validation.passed ? '通过' : '未通过'}`,
    '',
    `📊 相似度: ${validation.similarity}% (阈值: ${threshold}%)`,
    '',
  ];
  if (validation.regions.length > 0) {
    output.push(`⚠️ 发现 ${validation.regions.length} 个差异区域:`);
    for (const region of validation.regions) {
      output.push(`  - ${region.type}: ${region.diffPercentage}% 差异，位置 (${region.x}, ${region.y})，尺寸 ${region.width}x${region.height}`);
    }
  }
  if (validation.suggestions.length > 0) {
    output.push('', '💡 修复建议:', ...validation.suggestions.map((suggestion) => `  - ${suggestion}`));
  }

  return textResult(output.join('\n'), {
    success: true,
    ...toPublicValidation(validation),
  });
}

export async function handleRepairComponent(
  d2c: DesignToCode,
  args: any = {},
): Promise<MCPToolResult> {
  const {
    original_image,
    code,
    framework = 'html',
    style_framework = 'inline',
    component_library = 'none',
    typescript = false,
    quality_mode = 'precision',
    max_iterations,
    threshold = getDefaultValidationConfig().threshold,
  } = args;

  if (!original_image || !existsSync(original_image)) return fileNotFound(original_image);
  console.error(`[MCP] Repairing component with validation: ${original_image}`);

  const imageBuffer = await readFile(original_image);
  const extension = framework === 'react' ? (typescript ? 'tsx' : 'jsx') : framework === 'vue' ? 'vue' : 'html';
  const budget = { fast: 0, balanced: 2, precision: 4 } as const;
  const result = await d2c.repair(imageBuffer, {
    code,
    filename: `Component.${extension}`,
    imports: [],
    components: [],
  }, {
    framework,
    styleFramework: style_framework,
    componentLibrary: component_library,
    typescript,
    responsive: true,
    accessibility: true,
    qualityMode: quality_mode,
  }, {
    maxIterations: max_iterations ?? budget[quality_mode as keyof typeof budget],
    validationOverrides: { threshold },
  });

  if (!result.success) return toolError('REPAIR_FAILED', result.error || '代码修复失败');
  const iterations = result.metrics?.repairIterations || 0;
  const output = [
    iterations > 0 ? '✅ 修复与重新校验完成！' : '✅ 当前代码无需视觉修复',
    '',
    `🔁 修复轮次: ${iterations}`,
    `📊 最终相似度: ${result.validation?.similarity ?? '未知'}% ${result.validation?.passed ? '✅ 通过' : '❌ 未通过'}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    result.code.code,
  ];

  return textResult(output.join('\n'), {
    success: true,
    code: result.code.code,
    filename: result.code.filename,
    validation: result.validation ? toPublicValidation(result.validation) : undefined,
    repairIterations: iterations,
    qualityHistory: toPublicQualityHistory(result.qualityHistory),
    metrics: result.metrics,
  });
}

export async function handleAnalyzeStructure(
  d2c: DesignToCode,
  args: any = {},
): Promise<MCPToolResult> {
  const { image_path } = args;
  if (!image_path || !existsSync(image_path)) return fileNotFound(image_path);
  console.error(`[MCP] Analyzing structure: ${image_path}`);

  const imageBuffer = await readFile(image_path);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  const structure = await d2c.analyzeStructure(imageBase64);
  const output = [
    '✅ 结构分析完成！',
    '',
    `📄 页面: ${structure.page.title} (${structure.page.type})`,
    `📐 布局: ${structure.page.layout.type} / ${structure.page.layout.direction}`,
    `🧩 组件数: ${structure.components.length}`,
    `🎨 区域数: ${structure.regions.length}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    JSON.stringify(structure, null, 2),
  ];
  return textResult(output.join('\n'), { success: true, structure });
}

export async function handleExtractAssets(
  d2c: DesignToCode,
  args: any = {},
): Promise<MCPToolResult> {
  const { image_path, output_dir } = args;
  if (!image_path || !existsSync(image_path)) return fileNotFound(image_path);

  const outputDir = output_dir || join(
    dirname(image_path),
    `${basename(image_path, extname(image_path))}-assets`,
  );
  console.error(`[MCP] Extracting assets: ${image_path}`);

  const imageBuffer = await readFile(image_path);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  const paths = await d2c.extractAssets(imageBase64, outputDir);
  const output = [
    `✅ 资源提取完成，共 ${paths.length} 个文件`,
    `📁 输出目录: ${outputDir}`,
    '',
    ...paths.map((path) => `- ${path}`),
  ];
  return textResult(output.join('\n'), { success: true, outputDir, paths });
}

export async function startMCPServer() {
  const server = await createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Design-to-Code MCP Server started');
  console.error(`[MCP] Available tools: ${toolDefinitions.map((tool) => tool.name).join(', ')}`);
}
