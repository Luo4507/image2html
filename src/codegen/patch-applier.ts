import { z } from 'zod';

export interface CodeEdit {
  oldText: string;
  newText: string;
  reason?: string;
}

const editSchema = z.object({
  oldText: z.string().min(1),
  newText: z.string(),
  reason: z.string().optional(),
});

export function parseCodeEdits(content: string): CodeEdit[] {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Patch response does not contain JSON');

  const parsed = z.object({ edits: z.array(editSchema).min(1) })
    .parse(JSON.parse(unfenced.slice(start, end + 1)));
  return parsed.edits;
}

export function applyCodeEdits(
  currentCode: string,
  edits: CodeEdit[]
): { code: string; appliedCount: number } {
  let code = currentCode;
  let appliedCount = 0;

  for (const edit of edits) {
    if (!code.includes(edit.oldText)) {
      throw new Error(`oldText not found: ${edit.oldText.slice(0, 80)}`);
    }
    code = code.replace(edit.oldText, edit.newText);
    appliedCount += 1;
  }

  return { code, appliedCount };
}
