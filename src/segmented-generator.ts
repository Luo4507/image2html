import type { CodegenOptions, PlannedRegion } from './types.js';

export function buildRegionGenerationPrompt(
  region: PlannedRegion,
  options: CodegenOptions,
  pageWidth: number,
  pageHeight: number
): string {
  return `请根据提供的区域截图，生成该区域的真实 HTML/CSS 代码。

区域：${region.id} (${region.type})
区域说明：${region.description}
原图尺寸：${pageWidth}x${pageHeight}
区域纵向范围：${region.startY}-${region.endY}
样式方案：${options.styleFramework}
响应式：${options.responsive ? '是' : '否'}

要求：
- 只生成当前区域的 HTML 片段及必要的 <style>，不要输出 <html>、<head>、<body>。
- 准确保留区域内的文字、布局、颜色、间距、字体和组件尺寸。
- 使用语义化标签和有意义的 class 名称。
- 不依赖外部图片、字体、脚本或异步接口。
- 不输出 Markdown、分析或解释。`;
}

export function assembleHtmlDocument(title: string, fragments: string[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    img { max-width: 100%; }
  </style>
</head>
<body>
${fragments.join('\n')}
</body>
</html>`;
}
