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

interface NormalizedSource {
  /** Code with every whitespace run collapsed (to a space, or removed entirely). */
  normalized: string;
  /** Original start offset for each normalized character. */
  starts: number[];
  /** Original end offset (exclusive) for each normalized character. */
  ends: number[];
}

/**
 * Build a whitespace-insensitive view of the code, keeping a map back to
 * original offsets. When keepSpace is true each whitespace run becomes a
 * single space; otherwise whitespace is dropped completely.
 */
function normalizeWithMap(code: string, keepSpace: boolean): NormalizedSource {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  let whitespace: { start: number; end: number } | null = null;
  while (i < code.length) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      const start = i;
      while (i < code.length && ' \t\r\n'.includes(code[i])) i += 1;
      whitespace = { start, end: i };
      continue;
    }
    if (whitespace && keepSpace) {
      chars.push(' ');
      starts.push(whitespace.start);
      ends.push(whitespace.end);
    }
    whitespace = null;
    chars.push(ch);
    starts.push(i);
    ends.push(i + 1);
    i += 1;
  }
  return { normalized: chars.join(''), starts, ends };
}

function locateAndReplace(
  code: string,
  oldText: string,
  newText: string,
  keepSpace: boolean
): string | null {
  const source = normalizeWithMap(code, keepSpace);
  const target = normalizeWithMap(oldText, keepSpace);
  const core = target.normalized.trim();
  if (!core) return null;
  const index = source.normalized.indexOf(core);
  if (index < 0) return null;
  const spanStart = source.starts[index];
  const spanEnd = source.ends[index + core.length - 1];
  return code.slice(0, spanStart) + newText + code.slice(spanEnd);
}

/**
 * Whitespace-tolerant replacement: locate oldText in code after collapsing
 * whitespace on both sides, then replace the spanned original range.
 * Returns the updated code, or null when oldText cannot be located.
 */
function fuzzyReplace(code: string, oldText: string, newText: string): string | null {
  // Anchor on non-whitespace so leading/trailing indentation in oldText does
  // not expand the replaced span into neighboring lines.
  return locateAndReplace(code, oldText, newText, true)
    // Retry with whitespace fully removed; this catches cases where the model
    // joins lines that are separate (or vice versa) in the current code.
    ?? locateAndReplace(code, oldText, newText, false);
}

export function applyCodeEdits(
  currentCode: string,
  edits: CodeEdit[]
): { code: string; appliedCount: number } {
  let code = currentCode;
  let appliedCount = 0;

  for (const edit of edits) {
    if (code.includes(edit.oldText)) {
      code = code.replace(edit.oldText, edit.newText);
      appliedCount += 1;
      continue;
    }
    // Fallback: models often re-indent or re-wrap oldText, so retry with
    // whitespace-insensitive matching before giving up on the patch.
    const replaced = fuzzyReplace(code, edit.oldText, edit.newText);
    if (replaced === null) {
      throw new Error(`oldText not found: ${edit.oldText.slice(0, 80)}`);
    }
    code = replaced;
    appliedCount += 1;
  }

  return { code, appliedCount };
}