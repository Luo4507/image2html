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

  it('matches oldText with different indentation', () => {
    const code = [
      '<Menu',
      '  theme="dark"',
      '  mode="inline"',
      '  items={items}',
      '/>',
    ].join('\n');
    // Model emits the same snippet re-indented with extra spaces.
    const result = applyCodeEdits(code, [{
      oldText: '      <Menu\n        theme="dark"\n        mode="inline"\n        items={items}\n      />',
      newText: '      <Menu theme="light" mode="inline" items={items} />',
    }]);

    expect(result.appliedCount).toBe(1);
    expect(result.code).toContain('<Menu theme="light" mode="inline" items={items} />');
    expect(result.code).not.toContain('theme="dark"');
  });

  it('matches oldText with collapsed or expanded line breaks', () => {
    const code = 'const a = 1;\r\nconst b = 2;\r\nconst c = 3;';
    const result = applyCodeEdits(code, [{
      oldText: 'const a = 1;\nconst b\n = 2;',
      newText: 'const a = 10;\nconst b = 20;',
    }]);

    expect(result.appliedCount).toBe(1);
    expect(result.code).toBe('const a = 10;\nconst b = 20;\r\nconst c = 3;');
  });

  it('preserves surrounding code when replacing a fuzzy match mid-file', () => {
    const code = 'header();\n<Layout\n  className="h-screen"\n  theme="dark"\n>\nfooter();';
    const result = applyCodeEdits(code, [{
      oldText: '<Layout className="h-screen" theme="dark">',
      newText: '<Layout className="min-h-screen">',
    }]);

    expect(result.appliedCount).toBe(1);
    expect(result.code).toBe('header();\n<Layout className="min-h-screen">\nfooter();');
  });

  it('still rejects oldText that appears nowhere even fuzzily', () => {
    expect(() => applyCodeEdits('const a = 1;', [{
      oldText: '<Menu theme="dark" />',
      newText: '<Menu theme="light" />',
    }])).toThrow('oldText not found');
  });
});