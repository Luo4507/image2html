import { describe, expect, it } from 'vitest';
import {
  parseQualityBaseline,
  recommendQualityGates,
} from '../src/validator/quality-baseline.js';

describe('quality baseline', () => {
  it('validates the baseline document', () => {
    const baseline = parseQualityBaseline({
      version: 1,
      samples: [{ image: 'login.png', label: 'accepted' }],
    });
    expect(baseline.samples).toHaveLength(1);
  });

  it('recommends gates from accepted samples only', () => {
    const gates = recommendQualityGates([
      { label: 'accepted', overallSimilarity: 95, contentSimilarity: 80, edgeSimilarity: 60 },
      { label: 'accepted', overallSimilarity: 90, contentSimilarity: 70, edgeSimilarity: 50 },
      { label: 'draft', overallSimilarity: 99, contentSimilarity: 99, edgeSimilarity: 99 },
    ]);

    expect(gates).toEqual({
      threshold: 90,
      minContentSimilarity: 70,
      minEdgeSimilarity: 50,
    });
  });
});
