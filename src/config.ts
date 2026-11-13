/**
 * 配置管理
 */

import 'dotenv/config';
import type { ModelConfig, ValidationConfig } from './types.js';

/** 默认模型配置（从环境变量读取） */
export function getDefaultModelConfig(): ModelConfig {
  return {
    visionModel: {
      baseUrl: process.env.QWEN_VL_BASE_URL || 'http://qwen-vl.internal:8000/v1',
      model: process.env.VISION_MODEL || 'qwen3.5-vl-72b-instruct',
      apiKey: process.env.QWEN_VL_API_KEY || 'internal-key',
    },
    codeModel: {
      baseUrl: process.env.GLM_BASE_URL || 'http://glm.internal:8001/v1',
      model: process.env.CODE_MODEL || 'glm-5.3',
      apiKey: process.env.GLM_API_KEY || 'internal-key',
    },
  };
}

/** 默认校验配置 */
export function getDefaultValidationConfig(): ValidationConfig {
  return {
    threshold: parseFloat(process.env.VISUAL_SIMILARITY_THRESHOLD || '85.0'),
    minContentSimilarity: parseFloat(process.env.MIN_CONTENT_SIMILARITY || '60.0'),
    minEdgeSimilarity: parseFloat(process.env.MIN_EDGE_SIMILARITY || '40.0'),
    checkTextCoverage: process.env.CHECK_TEXT_COVERAGE === 'true',
    minTextCoverage: parseFloat(process.env.MIN_TEXT_COVERAGE || '80.0'),
    viewports: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 812 },
    },
    maxRetryCount: parseInt(process.env.MAX_RETRY_COUNT || '3', 10),
    navigationTimeoutMs: parseInt(process.env.NAVIGATION_TIMEOUT_MS || '30000', 10),
  };
}

/** 默认代码生成选项 */
export function getDefaultCodegenOptions() {
  return {
    framework: (process.env.DEFAULT_FRAMEWORK || 'react') as 'react' | 'vue' | 'html',
    styleFramework: (process.env.DEFAULT_STYLE_FRAMEWORK || 'tailwind') as 'tailwind' | 'scss' | 'css-modules' | 'inline',
    componentLibrary: (process.env.DEFAULT_COMPONENT_LIBRARY || 'antd') as 'antd' | 'element' | 'none',
    typescript: process.env.DEFAULT_TYPESCRIPT !== 'false',
    responsive: process.env.DEFAULT_RESPONSIVE !== 'false',
    accessibility: process.env.DEFAULT_ACCESSIBILITY !== 'false',
    pipeline: (process.env.DEFAULT_PIPELINE || 'direct') as 'direct' | 'structured',
    qualityMode: (process.env.QUALITY_MODE || 'balanced') as 'fast' | 'balanced' | 'precision',
    assetMode: 'none' as const,
  };
}
