import { describe, expect, it } from 'vitest';
import { runAutoCorrection } from '../src/validator/auto-corrector.js';

interface Score {
  similarity: number;
  passed: boolean;
}

describe('runAutoCorrection', () => {
  it('returns immediately when the initial validation passes', async () => {
    const result = await runAutoCorrection({
      initialCode: 'good',
      initialValidation: { similarity: 95, passed: true },
      maxIterations: 3,
      repair: async () => 'unused',
      validate: async () => ({ similarity: 0, passed: false }),
    });

    expect(result.code).toBe('good');
    expect(result.iterations).toBe(0);
    expect(result.history[0].iteration).toBe(0);
  });

  it('keeps improvements until validation passes', async () => {
    const scores: Score[] = [
      { similarity: 90, passed: true },
    ];
    const result = await runAutoCorrection({
      initialCode: 'first',
      initialValidation: { similarity: 70, passed: false },
      maxIterations: 3,
      repair: async () => 'better',
      validate: async () => scores.shift()!,
    });

    expect(result.code).toBe('better');
    expect(result.validation.similarity).toBe(90);
    expect(result.iterations).toBe(1);
    expect(result.history).toHaveLength(2);
    expect(result.history[1].adopted).toBe(true);
  });

  it('stops without adopting a version that does not improve', async () => {
    const result = await runAutoCorrection({
      initialCode: 'best',
      initialValidation: { similarity: 80, passed: false },
      maxIterations: 3,
      repair: async () => 'worse',
      validate: async () => ({ similarity: 79, passed: false }),
    });

    expect(result.code).toBe('best');
    expect(result.validation.similarity).toBe(80);
    expect(result.iterations).toBe(1);
    expect(result.history[1].adopted).toBe(false);
  });

  it('can use a custom quality score instead of raw pixel similarity', async () => {
    const result = await runAutoCorrection({
      initialCode: 'best',
      initialValidation: { similarity: 99, passed: false },
      maxIterations: 2,
      score: (validation) => validation.similarity < 99.5 ? 100 : 50,
      repair: async () => 'candidate',
      validate: async () => ({ similarity: 99.5, passed: false }),
    });

    expect(result.code).toBe('best');
    expect(result.iterations).toBe(1);
  });
});
