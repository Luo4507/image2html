import { describe, expect, it } from 'vitest';
import { calculateQualityMetrics } from '../src/validator/quality-metrics.js';

function image(width: number, height: number, value = 255): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return data;
}

function rectangle(data: Buffer, width: number, x: number, y: number, size: number) {
  for (let row = y; row < y + size; row += 1) {
    for (let column = x; column < x + size; column += 1) {
      const index = (row * width + column) * 4;
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
    }
  }
}

function verticalLine(data: Buffer, width: number, height: number, x: number) {
  for (let y = 10; y < height - 10; y += 1) {
    const index = (y * width + x) * 4;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
  }
}

describe('calculateQualityMetrics', () => {
  it('returns perfect scores for identical images', () => {
    const original = image(20, 20);
    const result = calculateQualityMetrics({
      original,
      generated: original,
      width: 20,
      height: 20,
    });

    expect(result.qualityScore).toBe(100);
    expect(result.contentSimilarity).toBe(100);
    expect(result.edgeSimilarity).toBe(100);
  });

  it('penalizes missing foreground content beyond the overall pixel score', () => {
    const original = image(100, 100);
    rectangle(original, 100, 40, 40, 20);
    const generated = image(100, 100);

    const result = calculateQualityMetrics({
      original,
      generated,
      width: 100,
      height: 100,
    });

    expect(result.contentRatio).toBeGreaterThan(0);
    expect(result.contentSimilarity).toBe(0);
    expect(result.edgeSimilarity).toBe(0);
    expect(result.qualityScore).toBeLessThan(result.overallSimilarity);
  });

  it('tolerates a one-pixel edge shift', () => {
    const original = image(100, 100);
    const generated = image(100, 100);
    verticalLine(original, 100, 100, 40);
    verticalLine(generated, 100, 100, 41);

    const result = calculateQualityMetrics({
      original,
      generated,
      width: 100,
      height: 100,
    });

    expect(result.edgeSimilarity).toBeGreaterThan(80);
  });
});
