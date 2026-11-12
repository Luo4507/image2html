import { describe, expect, it, vi } from 'vitest';
import type { DesignToCode } from '../src/index.js';
import { handleGenerateComponent, handleValidateDesign } from '../src/mcp/server.js';

describe('MCP option parity', () => {
  it('maps every generation option to the conversion request', async () => {
    const convert = vi.fn().mockResolvedValue({
      success: true,
      code: { code: 'export default function Demo() {}', filename: 'Demo.tsx', imports: [], components: ['Demo'] },
    });
    const d2c = { convert } as unknown as DesignToCode;

    await handleGenerateComponent(d2c, {
      image_path: 'examples/fixtures/demo/login.png',
      framework: 'react', component_library: 'antd', typescript: true, responsive: true,
      style_framework: 'inline', pipeline: 'structured', quality_mode: 'precision',
      layout_mode: 'single', asset_mode: 'extract',
    });

    expect(convert.mock.calls[0][0].options).toMatchObject({
      framework: 'react', styleFramework: 'inline', componentLibrary: 'antd',
      typescript: true, responsive: true, pipeline: 'structured', qualityMode: 'precision',
      layoutMode: 'single', assetMode: 'extract',
    });
  });

  it('applies threshold and framework options to actual validation', async () => {
    const validate = vi.fn().mockResolvedValue({
      similarity: 99, passed: true, regions: [], suggestions: [], screenshots: { desktop: '' },
    });
    const d2c = { validate } as unknown as DesignToCode;

    await handleValidateDesign(d2c, {
      original_image: 'examples/fixtures/demo/login.png', code: '<main>demo</main>', threshold: 97,
      framework: 'react', style_framework: 'tailwind', component_library: 'antd', typescript: true,
    });

    expect(validate.mock.calls[0][2]).toMatchObject({
      framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd', typescript: true,
    });
    expect(validate.mock.calls[0][3]).toMatchObject({ threshold: 97 });
  });
});
