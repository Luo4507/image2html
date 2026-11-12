import { z } from 'zod';
import type { AssetRegion } from '../types.js';

const assetSchema = z.object({
  name: z.string().min(1),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export function buildAssetDetectionPrompt(): string {
  return `请识别设计稿中适合裁剪复用的 Logo、图标、商品图片和背景图片。

只输出合法 JSON：
{
  "assets": [
    {"name":"logo","x":10,"y":20,"width":100,"height":80}
  ]
}

要求：
- 坐标和尺寸使用原图像素。
- 区域只包含目标资源，尽量不要包含无关文字或按钮。
- 不为纯色背景、普通文本或简单 CSS 图标创建资源。
- 没有适合提取的资源时返回 {"assets":[]}。`;
}

export function parseAssetRegions(content: string): AssetRegion[] {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Asset detection does not contain JSON');

  return z.object({ assets: z.array(assetSchema) })
    .parse(JSON.parse(unfenced.slice(start, end + 1))).assets;
}
