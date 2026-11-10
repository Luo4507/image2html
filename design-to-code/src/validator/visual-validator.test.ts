import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { VisualValidator } from './visual-validator.js';
import { getDefaultValidationConfig } from '../config.js';

describe('VisualValidator image comparison', () => {
  it('compares RGB and RGBA images with the same dimensions', async () => {
    const rgb = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const rgba = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const validator = new VisualValidator(getDefaultValidationConfig());
    const result = await (validator as any).compareImages(rgb, rgba);

    expect(result.similarity).toBe(100);
    expect(result.regions).toEqual([]);
  });
});
