import 'dotenv/config';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { VisualValidator } from '../src/validator/visual-validator.js';
import { getDefaultValidationConfig } from '../src/config.js';
import type { CodegenOptions, GeneratedCode } from '../src/types.js';

const validators: VisualValidator[] = [];
afterEach(async () => {
  await Promise.all(validators.splice(0).map((validator) => validator.close()));
});

function validator(): VisualValidator {
  const instance = new VisualValidator(getDefaultValidationConfig());
  validators.push(instance);
  return instance;
}

function options(overrides: Partial<CodegenOptions> = {}): CodegenOptions {
  return {
    framework: 'react', styleFramework: 'inline', componentLibrary: 'none',
    typescript: true, responsive: true, accessibility: true, ...overrides,
  };
}

function generated(code: string, filename: string): GeneratedCode {
  return { code, filename, imports: [], components: [] };
}

async function originalImage() {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: '#ffffff' },
  }).png().toBuffer();
}

describe('VisualValidator framework rendering', () => {
  it('captures all viewports from a built React component', async () => {
    const result = await validator().validate(
      await originalImage(),
      generated('export default function Demo() { return <main>React validation</main>; }', 'Demo.tsx'),
      { captureAllViewports: true, codegenOptions: options() },
    );

    expect(result.screenshots.desktop.length).toBeGreaterThan(100);
    expect(result.screenshots.tablet?.length).toBeGreaterThan(100);
    expect(result.screenshots.mobile?.length).toBeGreaterThan(100);
    expect(Number.isFinite(result.similarity)).toBe(true);
  }, 60_000);

  it('captures all viewports from a built Vue SFC', async () => {
    const result = await validator().validate(
      await originalImage(),
      generated('<template><main>Vue validation</main></template><script setup lang="ts"></script>', 'Demo.vue'),
      { captureAllViewports: true, codegenOptions: options({ framework: 'vue', componentLibrary: 'element' }) },
    );

    expect(result.screenshots.desktop.length).toBeGreaterThan(100);
    expect(result.screenshots.tablet?.length).toBeGreaterThan(100);
    expect(result.screenshots.mobile?.length).toBeGreaterThan(100);
    expect(Number.isFinite(result.similarity)).toBe(true);
  }, 60_000);

  it('uses extracted asset bytes for HTML rendering and comparison', async () => {
    const redPixel = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#ff0000' },
    }).png().toBuffer();
    const result = await validator().validate(
      redPixel,
      {
        ...generated('<html><body style="margin:0"><img src="/assets/pixel.png" width="1" height="1" style="display:block"></body></html>', 'Demo.html'),
        assets: [{ name: 'pixel.png', mimeType: 'image/png', data: redPixel.toString('base64') }],
      },
      { codegenOptions: options({ framework: 'html', typescript: false }) },
    );

    expect(result.similarity).toBe(100);
  }, 60_000);
  it('rejects an empty React mount instead of returning a similarity score', async () => {
    await expect(validator().validate(
      await originalImage(),
      generated('export default function Demo() { return null; }', 'Empty.tsx'),
      { codegenOptions: options() },
    )).rejects.toThrow(/React.*(empty|mount|render)/i);
  }, 60_000);
});
