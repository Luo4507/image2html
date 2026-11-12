import type { GeneratedAsset } from '../types.js';

export function buildAssetManifestPrompt(assets: GeneratedAsset[] = []): string {
  if (assets.length === 0) return '';
  const manifest = assets.map((asset) => `- /assets/${asset.name}`).join('\n');
  return `## 可用图片资源\n只能使用以下已提取资源路径；需要 Logo、图标或图片时选择最匹配的一项，不得编造其他本地路径或外部 URL：\n${manifest}\n引用时使用 <img src="/assets/文件名"> 或等价框架语法，并保留原图宽高比。`;
}
