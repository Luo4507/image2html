import type { CodegenOptions, PlannedRegion, GeneratedAsset } from './types.js';
import { buildAssetManifestPrompt } from './prompts/asset-manifest.js';

export function buildRegionGenerationPrompt(
  region: PlannedRegion,
  options: CodegenOptions,
  pageWidth: number,
  pageHeight: number,
  assets: GeneratedAsset[] = []
): string {
  const targetContract = buildRegionTargetContract(region, options);
  return `请根据提供的区域截图，生成该区域的真实 ${options.framework} 代码。

区域：${region.id} (${region.type})
区域说明：${region.description}
原图尺寸：${pageWidth}x${pageHeight}
区域纵向范围：${region.startY}-${region.endY}
样式方案：${options.styleFramework}
响应式：${options.responsive ? '是' : '否'}

${buildAssetManifestPrompt(assets)}

要求：
${targetContract}
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
function regionComponentName(region: PlannedRegion): string {
  const name = region.id.replace(/[^a-zA-Z0-9]/g, ' ').split(' ').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  return `${name || 'Region'}Region`;
}

function buildRegionTargetContract(region: PlannedRegion, options: CodegenOptions): string {
  if (options.framework === 'react') {
    return `- 只生成当前区域的 React 组件，使用 export function ${regionComponentName(region)}() 导出，不使用 export default。
- 返回合法 TSX/JSX；可在文件顶部导入当前组件库允许的依赖。
- 不创建 React root，不输出完整页面外壳。`;
  }
  if (options.framework === 'vue') {
    return `- 只生成当前区域的合法 Vue SFC，包含 <template>、可选 <script setup${options.typescript ? ' lang="ts"' : ''}> 和可选 <style>。
- template 只包含当前区域，不创建应用，不输出完整页面外壳。`;
  }
  return '- 只生成当前区域的 HTML 片段及必要的 <style>，不要输出 <html>、<head>、<body>。';
}

export function assembleFrameworkRegionCode(
  options: CodegenOptions,
  fragments: string[],
): string {
  if (options.framework === 'react') {
    const imports = new Set<string>();
    const componentNames: string[] = [];
    const components = fragments.map((fragment) => {
      const withoutImports = fragment.replace(/^import\s+.*?;\s*$/gm, (statement) => {
        imports.add(statement.trim());
        return '';
      }).trim();
      const match = withoutImports.match(/export\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/);
      if (!match) throw new Error('React region must export a named component');
      componentNames.push(match[1]);
      return withoutImports;
    });
    return `${Array.from(imports).join('\n')}\n\n${components.join('\n\n')}\n\nexport default function GeneratedPage() {\n  return (\n    <main>\n${componentNames.map((name) => `      <${name} />`).join('\n')}\n    </main>\n  );\n}`;
  }

  if (options.framework === 'vue') {
    const templates: string[] = [];
    const scripts: string[] = [];
    const styles: string[] = [];
    for (const fragment of fragments) {
      const template = fragment.match(/<template>([\s\S]*?)<\/template>/);
      if (!template) throw new Error('Vue region must contain a template');
      templates.push(template[1].trim());
      const script = fragment.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
      if (script) scripts.push(script[1].trim());
      const style = fragment.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      if (style) styles.push(style[1].trim());
    }
    const scriptLines = Array.from(new Set(scripts.flatMap((script) => script.split('\n').map((line) => line.trim()).filter(Boolean))));
    return `<template>\n<main>\n${templates.join('\n')}\n</main>\n</template>\n\n<script setup${options.typescript ? ' lang="ts"' : ''}>\n${scriptLines.join('\n')}\n</script>\n\n<style>\n${styles.join('\n\n')}\n</style>`;
  }

  return assembleHtmlDocument('GeneratedPage', fragments);
}
