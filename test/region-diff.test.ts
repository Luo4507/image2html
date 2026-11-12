import { describe, expect, it } from 'vitest';
import { aggregateDiffRegions } from '../src/validator/region-diff.js';

describe('aggregateDiffRegions', () => {
  it('aggregates changed pixels into semantic regions', () => {
    const width = 200;
    const height = 200;
    const mask = Buffer.alloc(width * height * 4);

    for (const [left, top] of [[0, 0], [100, 100]]) {
      for (let y = top; y < top + 40; y += 1) {
        for (let x = left; x < left + 40; x += 1) {
          mask[(y * width + x) * 4 + 3] = 255;
        }
      }
    }

    const regions = aggregateDiffRegions(mask, width, height, 100);

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.type).sort()).toEqual(['header', 'main']);
    expect(regions.every((region) => region.diffPixels === 1600)).toBe(true);
  });
});
