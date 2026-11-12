import { describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../src/config.js';
import type { GeneratedCode, ValidationResult } from '../src/types.js';

function generated(code: string): GeneratedCode {
  return { code, filename: 'Generatedpage.tsx', imports: [], components: ['Generatedpage'] };
}

function validVisualResult(): ValidationResult {
  return {
    similarity: 95, passed: true, regions: [], suggestions: [],
    screenshots: { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' },
    quality: {
      overallSimilarity: 95, contentSimilarity: 90, edgeSimilarity: 90,
      contentRatio: 1, qualityScore: 95,
    },
  };
}

function setup(qualityMode: 'fast' | 'balanced' = 'balanced') {
  const converter = new DesignToCode();
  (converter as any).generateDirectCode = async () => generated('export default function Broken() { return <main>; }');
  const repair = vi.fn().mockImplementation(async (current: GeneratedCode) => ({
    ...current, code: 'export default function Fixed() { return <main>Fixed</main>; }',
  }));
  (converter as any).repairCodeWithDiagnostics = repair;
  const request = {
    image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' as const },
    options: {
      ...getDefaultCodegenOptions(), framework: 'react' as const,
      styleFramework: 'inline' as const, componentLibrary: 'none' as const,
      typescript: true, qualityMode,
    },
    modelConfig: getDefaultModelConfig(),
    validationConfig: getDefaultValidationConfig(),
  };
  return { converter, repair, request };
}

describe('compiler-guided source repair', () => {
  it('repairs a failed React build before visual comparison', async () => {
    const { converter, repair, request } = setup();
    const validate = vi.fn()
      .mockRejectedValueOnce(new Error('React typecheck failed: missing closing tag'))
      .mockResolvedValueOnce(validVisualResult());
    (converter as any).validate = validate;

    const result = await converter.convert(request);

    expect(result.success).toBe(true);
    expect(result.code.code).toContain('Fixed');
    expect(result.validation?.passed).toBe(true);
    expect(repair).toHaveBeenCalledOnce();
    expect(repair.mock.calls[0][1]).toMatch(/missing closing tag/);
    expect(result.metrics?.modelCalls).toBe(2);
    expect(result.metrics?.repairIterations).toBe(1);
    expect(result.compileHistory).toEqual([
      expect.objectContaining({ iteration: 1, recovered: true }),
    ]);
    expect(validate).toHaveBeenCalledTimes(2);
    await converter.close();
  });

  it('stops after one failed repair and preserves the latest source', async () => {
    const { converter, repair, request } = setup();
    (converter as any).validate = vi.fn().mockRejectedValue(new Error('React build failed'));

    const result = await converter.convert(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('React build failed');
    expect(result.code.code).toContain('Fixed');
    expect(repair).toHaveBeenCalledOnce();
    expect(result.metrics?.modelCalls).toBe(2);
    expect(result.compileHistory?.[0].recovered).toBe(false);
    await converter.close();
  });

  it('does not invoke the repair model in fast mode', async () => {
    const { converter, repair, request } = setup('fast');
    (converter as any).validate = vi.fn().mockRejectedValue(new Error('React build failed'));

    const result = await converter.convert(request);

    expect(result.success).toBe(false);
    expect(repair).not.toHaveBeenCalled();
    expect(result.metrics?.modelCalls).toBe(1);
    await converter.close();
  });
});
