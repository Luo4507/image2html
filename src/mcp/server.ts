/**
 * MCP Server for Design-to-Code
 * 提供设计稿转代码的 MCP 工具服务
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'node:path';
import { DesignToCode } from '../index.js';
import { getDefaultModelConfig, getDefaultValidationConfig } from '../config.js';
import type { DesignToCodeResult, ValidationResult } from '../types.js';

/**
 * 创建并启动 MCP Server
 */
export async function createMCPServer() {
  const server = new Server(
    {
      name: 'design-to-code',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * 注册工具列表
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'generate_component',
        description: '根据设计稿截图生成前端组件代码。支持 React、Vue、HTML 三种框架，自动映射 Design Token 和组件库。',
        inputSchema: {
          type: 'object',
          properties: {
            image_path: {
              type: 'string',
              description: '设计稿图片的绝对路径（支持 PNG、JPG、JPEG）',
            },
            framework: {
              type: 'string',
              enum: ['react', 'vue', 'html'],
              default: 'react',
              description: '目标前端框架',
            },
            component_library: {
              type: 'string',
              enum: ['antd', 'element', 'none'],
              default: 'antd',
              description: 'UI 组件库（Ant Design / Element Plus / 无）',
            },
            typescript: {
              type: 'boolean',
              default: true,
              description: '是否使用 TypeScript',
            },
            responsive: {
              type: 'boolean',
              default: true,
              description: '是否生成响应式代码',
            },
          },
          required: ['image_path'],
        },
      },
      {
        name: 'validate_design',
        description: '校验生成代码与设计稿的视觉还原度。使用 Playwright 渲染代码并截图，与原图进行像素级对比。',
        inputSchema: {
          type: 'object',
          properties: {
            original_image: {
              type: 'string',
              description: '原始设计稿图片路径',
            },
            code: {
              type: 'string',
              description: '生成的 HTML/组件代码',
            },
            threshold: {
              type: 'number',
              default: 85.0,
              description: '相似度阈值（0-100），≥85% 为通过',
            },
          },
          required: ['original_image', 'code'],
        },
      },
      {
        name: 'repair_component',
        description: 'AI 自动修复代码中的视觉差异。分析差异原因，生成修复后的代码。',
        inputSchema: {
          type: 'object',
          properties: {
            original_image: {
              type: 'string',
              description: '原始设计稿图片路径',
            },
            code: {
              type: 'string',
              description: '当前需要修复的代码',
            },
            diff_regions: {
              type: 'array',
              description: '差异区域列表（从 validate_design 结果获取）',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  diffPercentage: { type: 'number' },
                },
              },
            },
          },
          required: ['original_image', 'code', 'diff_regions'],
        },
      },
      {
        name: 'analyze_structure',
        description: '仅分析设计稿结构，返回 JSON 格式的页面结构（不生成代码）。',
        inputSchema: {
          type: 'object',
          properties: {
            image_path: {
              type: 'string',
              description: '设计稿图片路径',
            },
          },
          required: ['image_path'],
        },
      },
      {
        name: 'extract_assets',
        description: '识别设计稿中可复用的 Logo、图标和图片，并裁剪为独立 PNG 资源。',
        inputSchema: {
          type: 'object',
          properties: {
            image_path: { type: 'string', description: '设计稿图片路径' },
            output_dir: { type: 'string', description: '资源输出目录（可选）' },
          },
          required: ['image_path'],
        },
      },
    ],
  }));

  /**
   * 处理工具调用
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // 初始化 DesignToCode 实例
    const d2c = new DesignToCode({
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
    });

    try {
      switch (name) {
        case 'generate_component': {
          return await handleGenerateComponent(d2c, args);
        }

        case 'validate_design': {
          return await handleValidateDesign(d2c, args);
        }

        case 'repair_component': {
          return await handleRepairComponent(d2c, args);
        }

        case 'analyze_structure': {
          return await handleAnalyzeStructure(d2c, args);
        }

        case 'extract_assets': {
          return await handleExtractAssets(d2c, args);
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ 执行出错: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    } finally {
      await d2c.close();
    }
  });

  return server;
}

/**
 * 处理生成组件请求
 */
async function handleGenerateComponent(
  d2c: DesignToCode,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    image_path,
    framework = 'react',
    component_library = 'antd',
    typescript = true,
    responsive = true,
  } = args;

  // 检查文件是否存在
  if (!existsSync(image_path)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 文件不存在: ${image_path}`,
        },
      ],
    };
  }

  console.error(`[MCP] Generating component from: ${image_path}`);
  console.error(`[MCP] Framework: ${framework}, Library: ${component_library}`);

  const result: DesignToCodeResult = await d2c.convert({
    image: {
      source: image_path,
      type: 'path',
      filename: image_path.split(/[\\/]/).pop(),
    },
    options: {
      framework: framework as any,
      styleFramework: 'tailwind',
      componentLibrary: component_library as any,
      typescript,
      responsive,
      accessibility: true,
    },
    modelConfig: getDefaultModelConfig(),
    validationConfig: getDefaultValidationConfig(),
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 代码生成失败: ${result.error}`,
        },
      ],
    };
  }

  // 构建输出
  const output = [
    `✅ 代码生成成功！`,
    ``,
    `📄 文件名: ${result.code.filename}`,
    `🧩 组件: ${result.code.components.join(', ') || '无'}`,
    `📦 依赖: ${result.code.imports.join(', ') || '无'}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    result.code.code,
  ];

  // 添加校验结果（如果有）
  if (result.validation) {
    output.unshift(
      `📊 视觉校验: ${result.validation.similarity}% ${result.validation.passed ? '✅ 通过' : '❌ 未通过'}`,
      ``
    );

    if (!result.validation.passed) {
      output.push(
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `⚠️ 差异区域:`,
        ...result.validation.regions.map(
          (r) => `  - ${r.type}: ${r.diffPercentage}% 差异 (${r.x}, ${r.y})`
        ),
        ``,
        `💡 修复建议:`,
        ...result.validation.suggestions.map((s) => `  - ${s}`)
      );
    }
  }

/** 处理资源提取请求 */
async function handleExtractAssets(d2c: DesignToCode, args: any) {
  const { image_path, output_dir } = args;
  if (!existsSync(image_path)) {
    return {
      content: [{ type: 'text', text: `❌ 文件不存在: ${image_path}` }],
      isError: true,
    };
  }

  const imageBuffer = await readFile(image_path);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  const paths = await d2c.extractAssets(
    imageBase64,
    output_dir || `output/assets-${Date.now()}`
  );

  return {
    content: [{
      type: 'text',
      text: `✅ 资源提取完成，共 ${paths.length} 个文件：\n${paths.join('\n')}`,
    }],
  };
}

  return {
    content: [
      {
        type: 'text',
        text: output.join('\n'),
      },
    ],
  };
}

/**
 * 处理校验设计请求
 */
async function handleValidateDesign(
  d2c: DesignToCode,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { original_image, code, threshold = 85.0 } = args;

  if (!existsSync(original_image)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 文件不存在: ${original_image}`,
        },
      ],
    };
  }

  console.error(`[MCP] Validating design: ${original_image}`);

  const imageBuffer = await readFile(original_image);
  const validation: ValidationResult = await d2c.validate(imageBuffer, {
    code,
    filename: '',
    imports: [],
    components: [],
  });

  const statusIcon = validation.passed ? '✅' : '❌';
  const statusText = validation.passed ? '通过' : '未通过';

  const output = [
    `${statusIcon} 视觉校验${statusText}`,
    ``,
    `📊 相似度: ${validation.similarity}% (阈值: ${threshold}%)`,
    ``,
  ];

  if (validation.regions.length > 0) {
    output.push(`⚠️ 发现 ${validation.regions.length} 个差异区域:`);
    for (const region of validation.regions) {
      output.push(
        `  - ${region.type}: ${region.diffPercentage}% 差异，位置 (${region.x}, ${region.y})，尺寸 ${region.width}x${region.height}`
      );
    }
    output.push(``);
  }

  if (validation.suggestions.length > 0) {
    output.push(`💡 修复建议:`);
    for (const suggestion of validation.suggestions) {
      output.push(`  - ${suggestion}`);
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: output.join('\n'),
      },
    ],
  };
}

/**
 * 处理修复组件请求
 */
async function handleRepairComponent(
  d2c: DesignToCode,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { original_image, code, diff_regions } = args;

  if (!existsSync(original_image)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 文件不存在: ${original_image}`,
        },
      ],
    };
  }

  console.error(`[MCP] Repairing component: ${original_image}`);

  // 先分析结构
  const imageBuffer = await readFile(original_image);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  const structure = await d2c.analyzeStructure(imageBase64);

  // 修复代码
  const repairedCode = await d2c.repairCode(structure, code, diff_regions);

  return {
    content: [
      {
        type: 'text',
        text: [
          `✅ 代码修复完成！`,
          ``,
          `修复的差异区域:`,
          ...diff_regions.map((r: any) => `  - ${r.type}: ${r.diffPercentage}%`),
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          repairedCode,
        ].join('\n'),
      },
    ],
  };
}

/**
 * 处理结构分析请求
 */
async function handleAnalyzeStructure(
  d2c: DesignToCode,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { image_path } = args;

  if (!existsSync(image_path)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 文件不存在: ${image_path}`,
        },
      ],
    };
  }

  console.error(`[MCP] Analyzing structure: ${image_path}`);

  const imageBuffer = await readFile(image_path);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const structure = await d2c.analyzeStructure(imageBase64);

  return {
    content: [
      {
        type: 'text',
        text: [
          `✅ 结构分析完成！`,
          ``,
          `📄 页面: ${structure.page.title} (${structure.page.type})`,
          `📐 布局: ${structure.page.layout.type} / ${structure.page.layout.direction}`,
          `🧩 组件数: ${structure.components.length}`,
          `🎨 区域数: ${structure.regions.length}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          JSON.stringify(structure, null, 2),
        ].join('\n'),
      },
    ],
  };
}

/**
 * 处理资源提取请求
 */
export async function handleExtractAssets(
  d2c: DesignToCode,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { image_path, output_dir } = args;

  if (!existsSync(image_path)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 文件不存在: ${image_path}`,
        },
      ],
    };
  }

  const outputDir = output_dir || join(
    dirname(image_path),
    `${basename(image_path, extname(image_path))}-assets`
  );
  console.error(`[MCP] Extracting assets: ${image_path}`);

  const imageBuffer = await readFile(image_path);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  const paths = await d2c.extractAssets(imageBase64, outputDir);

  return {
    content: [
      {
        type: 'text',
        text: [
          `✅ 资源提取完成，共 ${paths.length} 个文件`,
          `📁 输出目录: ${outputDir}`,
          '',
          ...paths.map((path) => `- ${path}`),
        ].join('\n'),
      },
    ],
  };
}
/**
 * 启动 MCP Server
 */
export async function startMCPServer() {
  const server = await createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('[MCP] Design-to-Code MCP Server started');
  console.error('[MCP] Available tools: generate_component, validate_design, repair_component, analyze_structure, extract_assets');
}

// 如果直接运行此文件，启动服务
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch((error) => {
    console.error('[MCP] Failed to start server:', error);
    process.exit(1);
  });
}
