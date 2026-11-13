import { describe, expect, it } from 'vitest';
import type { CodegenOptions } from '../src/types.js';
import { assertValidCodegenOptions } from '../src/runtime/codegen-options.js';
import { DesignToCode } from '../src/index.js';

function options(overrides: Partial<CodegenOptions> = {}): CodegenOptions {
  return {
    framework: 'html',
    styleFramework: 'inline',
    componentLibrary: 'none',
    typescript: false,
    responsive: true,
    accessibility: true,
    ...overrides,
  };
}

describe('codegen option compatibility', () => {
  it.each([
    options(),
    options({ framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd', typescript: true }),
    options({ framework: 'vue', styleFramework: 'inline', componentLibrary: 'element', typescript: true }),
    options({ framework: 'react', styleFramework: 'inline', componentLibrary: 'antd', layoutMode: 'segmented' }),
    options({ framework: 'vue', styleFramework: 'inline', componentLibrary: 'element', layoutMode: 'segmented' }),
  ])('accepts supported combinations', (value) => {
    expect(() => assertValidCodegenOptions(value)).not.toThrow();
  });

  it.each([
    [options({ framework: 'react', componentLibrary: 'element' }), 'React.*Element Plus'],
    [options({ framework: 'vue', componentLibrary: 'antd' }), 'Vue.*Ant Design'],
    [options({ framework: 'html', componentLibrary: 'antd' }), 'HTML.*none'],
    [options({ framework: 'react', styleFramework: 'scss', componentLibrary: 'antd' }), 'React.*tailwind.*inline'],
    [options({ framework: 'vue', styleFramework: 'css-modules', componentLibrary: 'element' }), 'Vue.*tailwind.*inline'],

  ])('rejects unsupported combinations before generation', (value, message) => {
    expect(() => assertValidCodegenOptions(value)).toThrow(new RegExp(message, 'i'));
  });
});

describe('conversion option guards', () => {
  it('rejects an invalid target before reading the image or calling a model', async () => {
    const converter = new DesignToCode();
    const result = await converter.convert({
      image: { source: 'does-not-exist.png', type: 'path' },
      options: options({ framework: 'react', componentLibrary: 'element' }),
      modelConfig: {
        visionModel: { baseUrl: 'http://127.0.0.1:1', model: 'unused', apiKey: 'unused' },
        codeModel: { baseUrl: 'http://127.0.0.1:1', model: 'unused', apiKey: 'unused' },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/React.*Element Plus/i);
    await converter.close();
  });
});

describe('generated filenames', () => {
  it('uses jsx for React JavaScript and tsx for React TypeScript', () => {
    const converter = new DesignToCode() as any;
    expect(converter.generateFilename('Demo Page', 'react', false)).toBe('DemoPage.jsx');
    expect(converter.generateFilename('Demo Page', 'react', true)).toBe('DemoPage.tsx');
    expect(converter.generateFilename('Demo Page', 'vue', false)).toBe('DemoPage.vue');
  });
});
