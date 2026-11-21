import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import type { CodegenOptions, GeneratedCode, ValidationResult } from '../src/types.js';

const options: CodegenOptions = {
  framework: 'react',
  styleFramework: 'inline',
  componentLibrary: 'antd',
  typescript: true,
  responsive: true,
  accessibility: true,
};

const currentCode: GeneratedCode = {
  code: 'export default function Demo() { return <main>current</main>; }',
  filename: 'Demo.tsx',
  imports: [],
  components: ['Demo'],
};

function visualResult(similarity: number, passed: boolean): ValidationResult {
  return {
    similarity,
    passed,
    regions: [],
    suggestions: [],
    screenshots: { desktop: 'rendered' },
    quality: {
      overallSimilarity: similarity,
      contentSimilarity: similarity,
      edgeSimilarity: similarity,
      contentRatio: 1,
      qualityScore: similarity,
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('independent visual repair', () => {
  it('does not call a model when the current code already passes', async () => {
    const converter = new DesignToCode();
    vi.spyOn(converter, 'validate').mockResolvedValue(visualResult(96, true));
    const repairWithVision = vi.spyOn(converter as any, 'repairWithVision');

    const result = await converter.repair(Buffer.from('image'), currentCode, options, { maxIterations: 2 });

    expect(result.success).toBe(true);
    expect(result.code.code).toBe(currentCode.code);
    expect(result.validation?.passed).toBe(true);
    expect(result.metrics?.repairIterations).toBe(0);
    expect(result.qualityHistory).toHaveLength(1);
    expect(repairWithVision).not.toHaveBeenCalled();
    await converter.close();
  });

  it('revalidates candidates and keeps the original when quality regresses', async () => {
    const converter = new DesignToCode();
    const validate = vi.spyOn(converter, 'validate')
      .mockResolvedValueOnce(visualResult(80, false))
      .mockResolvedValueOnce(visualResult(70, false));
    vi.spyOn(converter as any, 'repairWithVision').mockResolvedValue({
      code: 'export default function Demo() { return <main>worse</main>; }',
      modelCalls: 1,
    });

    const result = await converter.repair(Buffer.from('image'), currentCode, options, { maxIterations: 3 });

    expect(validate).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenNthCalledWith(2, expect.any(Buffer), expect.objectContaining({
      code: expect.stringContaining('worse'),
    }), options, undefined);
    expect(result.code.code).toBe(currentCode.code);
    expect(result.validation?.similarity).toBe(80);
    expect(result.metrics?.repairIterations).toBe(1);
    expect(result.qualityHistory?.[1]).toMatchObject({ adopted: false, improved: false });
    await converter.close();
  });

  it('adopts an improved candidate and stops when validation passes', async () => {
    const converter = new DesignToCode();
    vi.spyOn(converter, 'validate')
      .mockResolvedValueOnce(visualResult(80, false))
      .mockResolvedValueOnce(visualResult(95, true));
    vi.spyOn(converter as any, 'repairWithVision').mockResolvedValue({
      code: 'export default function Demo() { return <main>better</main>; }',
      modelCalls: 2,
    });

    const result = await converter.repair(Buffer.from('image'), currentCode, options, { maxIterations: 3 });

    expect(result.code.code).toContain('better');
    expect(result.validation?.passed).toBe(true);
    expect(result.metrics?.modelCalls).toBe(2);
    expect(result.metrics?.repairIterations).toBe(1);
    expect(result.qualityHistory?.[1]).toMatchObject({ adopted: true, improved: true });
    await converter.close();
  });
});
