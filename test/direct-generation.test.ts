import { describe, expect, it } from 'vitest';
import { buildDirectGenerationPrompt } from '../src/prompts/direct-generation.js';
import { DesignToCode } from '../src/index.js';
import type { CodegenOptions, DesignTokens } from '../src/types.js';

function options(overrides: Partial<CodegenOptions> = {}): CodegenOptions {
  return {
    framework: 'react',
    styleFramework: 'inline',
    componentLibrary: 'none',
    typescript: true,
    responsive: true,
    accessibility: true,
    ...overrides,
  };
}

const tokens: DesignTokens = {
  colors: {
    primary: '#ffffff', success: '#ffffff', warning: '#ffffff', error: '#ffffff',
    textPrimary: '#ffffff', textSecondary: '#ffffff', background: '#ffffff',
  },
  typography: {
    h1: { fontSize: '24px', fontWeight: 600 },
    h2: { fontSize: '20px', fontWeight: 600 },
    body: { fontSize: '14px', fontWeight: 400 },
  },
  spacing: { unit: 8, scale: [8, 16] },
  borderRadius: { sm: '4px', md: '8px', lg: '12px' },
};

describe('framework-specific direct generation prompts', () => {
  it('requires a default-exported React component with restricted dependencies', () => {
    const prompt = buildDirectGenerationPrompt(options({ componentLibrary: 'antd' }));
    expect(prompt).toContain('export default');
    expect(prompt).toContain('React');
    expect(prompt).toContain('antd');
    expect(prompt).toMatch(/only|仅.*依赖/i);
  });

  it('requires a legal Vue SFC with restricted dependencies', () => {
    const prompt = buildDirectGenerationPrompt(options({ framework: 'vue', componentLibrary: 'element' }));
    expect(prompt).toContain('<template>');
    expect(prompt).toContain('<script setup');
    expect(prompt).toContain('Element Plus');
    expect(prompt).toContain(':deep(');
    expect(prompt).toMatch(/only|仅.*依赖/i);
  });
});

describe('framework-safe generated code finalization', () => {
  it('does not prefix React with HTML styles or regex-rewrite native elements', () => {
    const converter = new DesignToCode() as any;
    const result = converter.finalizeGeneratedCode(
      'export default function Demo() { return <button className="primary">Go</button>; }',
      'Demo',
      options({ componentLibrary: 'antd' }),
      tokens,
    );

    expect(result.code).toContain('<button');
    expect(result.code).not.toContain("from 'antd'");
    expect(result.code.startsWith('<style>')).toBe(false);
  });
});
