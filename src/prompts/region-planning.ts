import { z } from 'zod';
import type { PlannedRegion } from '../types.js';

const regionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['header', 'hero', 'main', 'sidebar', 'footer', 'section']),
  startY: z.number().int().nonnegative(),
  endY: z.number().int().positive(),
  description: z.string(),
}).refine((region) => region.endY > region.startY, {
  message: 'endY must be greater than startY',
});

export function buildRegionPlanningPrompt(): string {
  return `请将这张 UI 设计稿拆分为 3-6 个主要水平区域，用于分区域代码生成。

只输出以下 JSON，不要输出 Markdown 或解释：
{
  "regions": [
    {
      "id": "header",
      "type": "header|hero|main|sidebar|footer|section",
      "startY": 0,
      "endY": 120,
      "description": "该区域包含的主要内容、布局和样式"
    }
  ]
}

要求：
- startY/endY 使用原图中的像素坐标。
- 按从上到下排列，区域不能重叠。
- 第一个区域必须从 0 开始，最后一个区域必须覆盖到图片底部。
- 只保留主要区域，不要输出组件级 JSON、颜色列表或详细组件树。`;
}

export function parseRegionPlan(content: string): PlannedRegion[] {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Region plan does not contain JSON');

  const parsed = z.object({ regions: z.array(regionSchema).min(1).max(8) })
    .parse(JSON.parse(unfenced.slice(start, end + 1)));

  return parsed.regions.sort((a, b) => a.startY - b.startY);
}
