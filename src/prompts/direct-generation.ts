import type { CodegenOptions } from '../types.js';

export function buildDirectGenerationPrompt(options: CodegenOptions): string {
  return `请直接根据提供的 UI 设计稿生成完整、可运行的 ${options.framework} 代码。

## 目标
- 尽可能准确还原原图的布局、颜色、字体、间距、圆角、阴影和组件层级。
- 使用图片中的原始文字、数字和内容，不要编造或遗漏关键内容。
- 生成真实、可编辑的 UI 代码，不得把整张截图作为页面图片来代替实现。

## 技术约束
- 框架：${options.framework}
- 样式：${options.styleFramework}
- 组件库：${options.componentLibrary}
- TypeScript：${options.typescript ? '是' : '否'}
- 响应式：${options.responsive ? '是' : '否'}
- 可访问性：${options.accessibility ? '是，使用语义化标签和必要 ARIA 属性' : '按需'}

## 实现要求
- 优先使用 Flexbox/Grid 和合理的组件拆分，避免不必要的绝对定位。
- 对重复区域提取轻量组件，但不要为了抽象而增加无关代码。
- 如果原图包含 Logo 或图片，使用简洁占位元素或 CSS 还原其尺寸和位置，不要调用外部服务。
- 页面加载后应立即显示内容，不依赖异步数据请求。
- 只输出代码，不要输出结构 JSON、分析过程、Markdown 标记或解释文字。`;
}

export function buildVisualRepairPrompt(input: {
  currentCode: string;
  suggestions: string[];
  regions: Array<{ type: string; diffPercentage: number }>;
}): string {
  const differences = input.regions
    .map((region) => `- ${region.type} 区域差异 ${region.diffPercentage}%`)
    .join('\n');

  return `请根据提供的原始设计图和当前渲染图，修复当前代码中的视觉差异。

## 检测到的差异
${differences || '未提供区域信息'}
${input.suggestions.map((suggestion) => `- ${suggestion}`).join('\n')}

## 当前代码
${input.currentCode}

## 修复要求
- 只修改与视觉差异相关的代码，保留其他结构和逻辑。
- 优先修正区域位置、尺寸、颜色、字体、间距和缺失内容。
- 不要删除已有功能，不要把页面替换为截图。
- 返回修复后的完整代码，不要输出分析过程或 Markdown 标记。`;
}

export function buildVisualPatchPrompt(input: {
  currentCode: string;
  suggestions: string[];
  regions: Array<{ type: string; diffPercentage: number }>;
}): string {
  const differences = input.regions
    .map((region) => `- ${region.type} 区域差异 ${region.diffPercentage}%`)
    .join('\n');

  return `请根据原图、当前渲染图和差异图，为当前代码生成最小范围的精确补丁。

## 检测到的差异
${differences || '未提供区域信息'}
${input.suggestions.map((suggestion) => `- ${suggestion}`).join('\n')}

## 当前代码
${input.currentCode}

## 输出格式
只输出合法 JSON，不要 Markdown 或解释：
{
  "edits": [
    {
      "oldText": "当前代码中精确存在且需要替换的连续代码片段",
      "newText": "修复后的代码片段",
      "reason": "该修改解决的视觉问题"
    }
  ]
}

要求：
- oldText 必须逐字来自当前代码，包括空格、标点和换行。
- 优先选择最小的唯一代码片段，不要输出整个文件。
- 不修改无关区域，不改变已确认的业务逻辑。
- 不把页面替换为图片，不添加外部依赖。`;
}
