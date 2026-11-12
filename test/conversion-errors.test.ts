import { describe, expect, it } from 'vitest';
import { DesignToCode } from '../src/index.js';
import { getDefaultCodegenOptions, getDefaultModelConfig, getDefaultValidationConfig } from '../src/config.js';

describe('conversion failure artifacts', () => {
  it('preserves generated source and metrics when framework validation fails', async () => {
    const converter = new DesignToCode();
    (converter as any).generateDirectCode = async () => ({
      code: 'export default function Broken() { return <main>; }',
      filename: 'Broken.tsx', imports: [], components: ['Broken'],
    });
    (converter as any).validate = async () => { throw new Error('React typecheck failed'); };

    const result = await converter.convert({
      image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' },
      options: {
        ...getDefaultCodegenOptions(),
        framework: 'react', styleFramework: 'inline', componentLibrary: 'none', typescript: true, qualityMode: 'fast',
      },
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('React typecheck failed');
    expect(result.code.code).toContain('Broken');
    expect(result.metrics?.modelCalls).toBe(1);
    await converter.close();
  });
});
