import { z } from 'zod';

export function buildTextExtractionPrompt(): string {
  return `请提取图片中所有用户可见的文字，包括标题、导航、按钮、正文、数字和标签。

只输出合法 JSON：
{"texts":["第一处文字","第二处文字"]}

要求：
- 按从上到下、从左到右排列。
- 保留原始文字和数字，不要翻译、解释或补充。
- 不输出不可见的代码或样式信息。`;
}

export function parseVisibleTexts(content: string): string[] {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Text extraction does not contain JSON');

  const parsed = z.object({ texts: z.array(z.string()) })
    .parse(JSON.parse(unfenced.slice(start, end + 1)));
  return [...new Set(parsed.texts.map((text) => text.trim()).filter(Boolean))];
}
