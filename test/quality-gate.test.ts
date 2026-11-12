import { describe, expect, it } from 'vitest';
import { passesQualityGate } from '../src/validator/quality-gate.js';

const config = {
  threshold: 85,
  minContentSimilarity: 60,
  minEdgeSimilarity: 40,
};

describe('passesQualityGate', () => {
  it('accepts a page that passes all visual gates', () => {
    expect(passesQualityGate({
      overallSimilarity: 98.5,
      contentSimilarity: 71.88,
      edgeSimilarity: 42.29,
      contentRatio: 0.01,
      qualityScore: 75.13,
    }, config)).toBe(true);
  });

  it('rejects missing foreground content despite high overall similarity', () => {
    expect(passesQualityGate({
      overallSimilarity: 96,
      contentSimilarity: 0,
      edgeSimilarity: 0,
      contentRatio: 0.04,
      qualityScore: 38.4,
    }, config)).toBe(false);
  });

  it('enforces text coverage when enabled', () => {
    expect(passesQualityGate({
      overallSimilarity: 98,
      contentSimilarity: 90,
      edgeSimilarity: 80,
      contentRatio: 0.1,
      qualityScore: 90,
      textCoverage: 50,
    }, { ...config, checkTextCoverage: true, minTextCoverage: 80 })).toBe(false);
  });
});
