/**
 * Design-to-Code 核心类型定义
 */

/** 设计稿图片输入 */
export interface DesignImage {
  /** 图片路径或 base64 */
  source: string;
  /** 图片类型 */
  type: 'path' | 'base64';
  /** 原始文件名（可选） */
  filename?: string;
}

/** 页面区域 */
export interface PageRegion {
  id: string;
  type: 'header' | 'sidebar' | 'main' | 'footer' | 'card' | 'table' | 'form';
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style: {
    background?: string;
    borderBottom?: string;
    borderRadius?: string;
    padding?: string;
    margin?: string;
  };
  children?: PageRegion[];
}

/** UI 组件 */
export interface UIComponent {
  id: string;
  type: 'button' | 'input' | 'select' | 'table' | 'card' | 'nav' | 'avatar' | 'text' | 'image';
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  props: {
    text?: string;
    placeholder?: string;
    type?: string;
    size?: 'small' | 'middle' | 'large';
    disabled?: boolean;
    [key: string]: unknown;
  };
  style: {
    background?: string;
    color?: string;
    borderRadius?: string;
    fontSize?: string;
    fontWeight?: number;
    [key: string]: unknown;
  };
}

/** Design Token */
export interface DesignTokens {
  colors: {
    primary: string;
    success: string;
    warning: string;
    error: string;
    textPrimary: string;
    textSecondary: string;
    background: string;
    border?: string;
    [key: string]: string | undefined;
  };
  typography: {
    h1: { fontSize: string; fontWeight: number };
    h2: { fontSize: string; fontWeight: number };
    h3?: { fontSize: string; fontWeight: number };
    body: { fontSize: string; fontWeight: number };
    caption?: { fontSize: string; fontWeight: number };
  };
  spacing: {
    unit: number;
    scale: number[];
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}

/** 页面结构分析结果 */
export interface PageStructure {
  page: {
    title: string;
    type: 'dashboard' | 'form' | 'list' | 'detail' | 'login' | 'other';
    layout: {
      type: 'flex' | 'grid';
      direction: 'row' | 'column';
      columns?: number;
    };
  };
  regions: PageRegion[];
  components: UIComponent[];
  designTokens: DesignTokens;
}

/** 代码生成选项 */
export interface CodegenOptions {
  framework: 'react' | 'vue' | 'html';
  styleFramework: 'tailwind' | 'scss' | 'css-modules' | 'inline';
  componentLibrary: 'antd' | 'element' | 'none';
  typescript: boolean;
  responsive: boolean;
  accessibility: boolean;
  /** direct: single multimodal generation; structured: JSON expert pipeline */
  pipeline?: 'direct' | 'structured';
  qualityMode?: 'fast' | 'balanced' | 'precision';
  layoutMode?: 'single' | 'segmented';
  /** Extract reusable image assets before generation. */
  assetMode?: 'none' | 'extract';
}

export interface PlannedRegion {
  id: string;
  type: 'header' | 'hero' | 'main' | 'sidebar' | 'footer' | 'section';
  startY: number;
  endY: number;
  description: string;
}

export interface AssetRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeneratedAsset {
  name: string;
  mimeType: string;
  /** Base64-encoded asset bytes. */
  data: string;
}

/** 生成的代码结果 */
export interface GeneratedCode {
  code: string;
  filename: string;
  imports: string[];
  components: string[];
  modelCalls?: number;
  assets?: GeneratedAsset[];
}

/** 视觉校验结果 */
export interface ValidationResult {
  /** 相似度 0-100 */
  similarity: number;
  /** 是否通过 */
  passed: boolean;
  /** 差异图片 base64 */
  diffImage?: string;
  /** 差异区域列表 */
  regions: DiffRegion[];
  /** 修复建议 */
  suggestions: string[];
  /** 各端截图 base64 */
  screenshots: {
    desktop: string;
    tablet?: string;
    mobile?: string;
  };
  /** 原图与渲染图的实际尺寸及画布差值 */
  dimensions?: {
    original: { width: number; height: number };
    generated: { width: number; height: number };
    widthDifference: number;
    heightDifference: number;
  };
  /** 内容区域和边缘感知质量指标 */
  quality?: VisualQualityMetrics;
  textCoverage?: number;
  missingTexts?: string[];
}

export interface VisualQualityMetrics {
  overallSimilarity: number;
  contentSimilarity: number;
  edgeSimilarity: number;
  contentRatio: number;
  qualityScore: number;
  textCoverage?: number;
}

/** 差异区域 */
export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPercentage: number;
  diffPixels: number;
  type: 'header' | 'sidebar' | 'main' | 'footer' | 'unknown';
}

/** 视口配置 */
export interface Viewport {
  width: number;
  height: number;
}

/** 校验配置 */
export interface ValidationConfig {
  threshold: number;
  minContentSimilarity: number;
  minEdgeSimilarity: number;
  checkTextCoverage: boolean;
  minTextCoverage: number;
  viewports: {
    desktop: Viewport;
    tablet: Viewport;
    mobile: Viewport;
  };
  maxRetryCount: number;
}

/** 模型配置 */
export interface ModelConfig {
  visionModel: {
    baseUrl: string;
    model: string;
    apiKey: string;
  };
  codeModel: {
    baseUrl: string;
    model: string;
    apiKey: string;
  };
}

/** 设计到代码转换请求 */
export interface DesignToCodeRequest {
  image: DesignImage;
  options: CodegenOptions;
  modelConfig: ModelConfig;
  validationConfig?: ValidationConfig;
  onProgress?: (event: ConversionProgressEvent) => void;
}

export interface ConversionProgressEvent {
  stage: 'reading' | 'analyzing' | 'generating' | 'preview' | 'validating' | 'repairing' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  chars?: number;
  codeSnapshot?: string;
}

/** 设计到代码转换结果 */
export interface DesignToCodeResult {
  /** 生成的代码 */
  code: GeneratedCode;
  /** 页面结构（中间协议） */
  structure?: PageStructure;
  /** 视觉校验结果 */
  validation?: ValidationResult;
  /** 各阶段性能指标 */
  metrics?: ConversionMetrics;
  /** 编译/运行失败修复历史 */
  compileHistory?: Array<{
    iteration: number;
    error: string;
    recovered: boolean;
  }>;
  /** 每次自动修复的评分和采用结果 */
  qualityHistory?: Array<{
    iteration: number;
    score: number;
    adopted: boolean;
    improved: boolean;
    validation: ValidationResult;
  }>;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

export interface ConversionMetrics {
  analysisMs: number;
  generationMs: number;
  validationMs: number;
  repairMs: number;
  totalMs: number;
  modelCalls: number;
  repairIterations: number;
  cacheHit?: boolean;
}

