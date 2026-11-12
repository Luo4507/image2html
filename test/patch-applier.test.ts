import { describe, expect, it } from 'vitest';
import { applyCodeEdits, parseCodeEdits } from '../src/codegen/patch-applier.js';

describe('code patches', () => {
  it('parses and applies an exact local edit', () => {
    const edits = parseCodeEdits(`{"edits":[{
      "oldText":"color: red;",
      "newText":"color: blue;",
      "reason":"match design"
    }]}`);
    const result = applyCodeEdits('button { color: red; }', edits);

    expect(result.code).toBe('button { color: blue; }');
    expect(result.appliedCount).toBe(1);
  });

  it('rejects edits whose source text is missing', () => {
    expect(() => applyCodeEdits('const a = 1;', [{
      oldText: 'const b = 2;',
      newText: 'const c = 3;',
    }])).toThrow('oldText not found');
  });
});
