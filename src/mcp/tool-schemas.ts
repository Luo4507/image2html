import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const errorSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: '稳定的机器可读错误码' },
    message: { type: 'string' },
  },
  required: ['code', 'message'],
};

const validationSchema = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    similarity: { type: 'number' },
    quality: { type: 'object' },
    regions: {
      type: 'array',
      description: '可直接传给 repair_component 的 diff_regions',
      items: { type: 'object' },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
    dimensions: { type: 'object' },
    layout: { type: 'object' },
    textCoverage: { type: 'number' },
    missingTexts: { type: 'array', items: { type: 'string' } },
    timings: {
      type: 'object',
      properties: {
        renderMs: { type: 'number' },
        compareMs: { type: 'number' },
        additionalViewportsMs: { type: 'number' },
        totalMs: { type: 'number' },
      },
    },
  },
};

const metricsSchema = {
  type: 'object',
  properties: {
    analysisMs: { type: 'number' },
    generationMs: { type: 'number' },
    validationMs: { type: 'number' },
    repairMs: { type: 'number' },
    totalMs: { type: 'number' },
    modelCalls: { type: 'number' },
    repairIterations: { type: 'number' },
    modelRequests: { type: 'array', items: { type: 'object' } },
    cacheHit: { type: 'boolean' },
  },
};

const frameworkProperties = {
  framework: { type: 'string', enum: ['react', 'vue', 'html'], default: 'html' },
  style_framework: { type: 'string', enum: ['tailwind', 'scss', 'css-modules', 'inline'], default: 'inline' },
  component_library: { type: 'string', enum: ['antd', 'element', 'none'], default: 'none' },
  typescript: { type: 'boolean', default: false },
};

export const generateComponentTool: Tool = {
  name: 'generate_component',
  description: '【图转网页/设计稿转代码首选工具】当用户要求把设计稿、截图、UI 图片转换成网页、页面或前端组件代码时，必须优先调用本工具，不要直接手写 HTML/CSS 替代。输入设计稿图片，输出 React/Vue/HTML 组件代码，支持视觉校验、自动修复和结构化结果。',
  inputSchema: {
    type: 'object',
    properties: {
      image_path: { type: 'string', description: '设计稿图片的绝对路径（支持 PNG、JPG、JPEG、WebP）' },
      framework: { ...frameworkProperties.framework, default: 'react' },
      component_library: { ...frameworkProperties.component_library, default: 'antd' },
      typescript: { ...frameworkProperties.typescript, default: true },
      responsive: { type: 'boolean', default: true },
      style_framework: { ...frameworkProperties.style_framework, default: 'tailwind' },
      pipeline: { type: 'string', enum: ['direct', 'structured'], default: 'direct' },
      quality_mode: { type: 'string', enum: ['fast', 'balanced', 'precision'], default: 'precision' },
      layout_mode: { type: 'string', enum: ['single', 'segmented', 'auto'], default: 'single' },
      asset_mode: { type: 'string', enum: ['none', 'extract'], default: 'none' },
    },
    required: ['image_path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      code: { type: 'string' },
      filename: { type: 'string' },
      imports: { type: 'array', items: { type: 'string' } },
      components: { type: 'array', items: { type: 'string' } },
      validation: validationSchema,
      metrics: metricsSchema,
      error: errorSchema,
    },
    required: ['success'],
  },
};

export const toolDefinitions: Tool[] = [
  generateComponentTool,
  {
    name: 'validate_design',
    description: '【视觉还原度校验】当需要检查生成代码与设计稿的还原程度时使用（例如生成后自检、用户要求对比原图）。使用 Playwright 渲染代码并与原图比较，返回相似度、差异区域与修改建议。视觉未通过是正常校验结果，不是工具协议错误。',
    inputSchema: {
      type: 'object',
      properties: {
        original_image: { type: 'string', description: '原始设计稿图片路径' },
        code: { type: 'string', description: '生成的 HTML/组件完整代码' },
        threshold: { type: 'number', default: 85, description: '本次整图相似度阈值（0-100）' },
        ...frameworkProperties,
      },
      required: ['original_image', 'code'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        ...validationSchema.properties,
        error: errorSchema,
      },
      required: ['success'],
    },
  },
  {
    name: 'repair_component',
    description: '【视觉偏差修复】当生成的网页/组件与设计稿存在视觉差异、需要按原图修复时使用。先校验当前代码，再执行视觉修复、候选重新校验和质量择优；不会写回业务文件。',
    inputSchema: {
      type: 'object',
      properties: {
        original_image: { type: 'string' },
        code: { type: 'string', description: '当前需要修复的完整代码' },
        diff_regions: {
          type: 'array',
          description: '兼容旧调用的可选参数；新流程会使用实时校验得到的区域',
          items: { type: 'object' },
        },
        ...frameworkProperties,
        quality_mode: { type: 'string', enum: ['fast', 'balanced', 'precision'], default: 'precision' },
        max_iterations: { type: 'number', minimum: 0, description: '可选修复轮次上限，仍受服务端 MAX_RETRY_COUNT 限制' },
        threshold: { type: 'number', default: 85 },
      },
      required: ['original_image', 'code'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        code: { type: 'string' },
        filename: { type: 'string' },
        validation: validationSchema,
        repairIterations: { type: 'number' },
        qualityHistory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              iteration: { type: 'number' },
              score: { type: 'number' },
              adopted: { type: 'boolean' },
              improved: { type: 'boolean' },
              validation: validationSchema,
            },
          },
        },
        metrics: metricsSchema,
        error: errorSchema,
      },
      required: ['success'],
    },
  },
  {
    name: 'analyze_structure',
    description: '【设计稿结构分析】当需要了解设计稿的区域划分、组件清单、设计 Token（主色、字号、间距、圆角）时使用。仅分析设计稿结构，在 structure 字段返回页面对象，不生成代码。适合生成前的布局理解或纯结构报告。',
    inputSchema: {
      type: 'object',
      properties: { image_path: { type: 'string' } },
      required: ['image_path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        structure: { type: 'object' },
        error: errorSchema,
      },
      required: ['success'],
    },
  },
  {
    name: 'extract_assets',
    description: '【图片素材裁切】当需要从设计稿中提取 Logo、图标、照片等图片素材时使用，识别并裁剪为 PNG；仅本地 MCP 可用，会真实写入文件。照片型页面高保真还原的必备步骤。',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: { type: 'string' },
        output_dir: { type: 'string', description: '资源输出目录（可选）' },
      },
      required: ['image_path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        outputDir: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        error: errorSchema,
      },
      required: ['success'],
    },
  },
];
