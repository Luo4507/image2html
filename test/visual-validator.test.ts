import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { VisualValidator } from '../src/validator/visual-validator.js';
import { getDefaultValidationConfig } from '../src/config.js';

describe('VisualValidator image comparison', () => {
  it('compares RGB and RGBA images with the same dimensions', async () => {
    const rgb = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const rgba = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#ffffff' } }).png().toBuffer();
    const validator = new VisualValidator(getDefaultValidationConfig());
    const result = await (validator as any).compareImages(rgb, rgba);
    expect(result.similarity).toBe(100);
    expect(result.regions).toEqual([]);
  });

  it('pads shorter screenshots without stretching and reports dimensions', async () => {
    const red = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const original = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    }).composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
    const validator = new VisualValidator(getDefaultValidationConfig());
    const result = await (validator as any).compareImages(original, red);

    expect(result.similarity).toBe(100);
    expect(result.dimensions).toEqual({
      original: { width: 20, height: 20 },
      generated: { width: 20, height: 10 },
      widthDifference: 0,
      heightDifference: 10,
    });
  });

  it('crops taller screenshots instead of vertically compressing them', async () => {
    const red = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const original = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    }).composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
    const generated = await sharp({
      create: { width: 20, height: 30, channels: 3, background: '#ffffff' },
    }).composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
    const validator = new VisualValidator(getDefaultValidationConfig());
    const result = await (validator as any).compareImages(original, generated);

    expect(result.similarity).toBe(100);
    expect(result.dimensions.generated.height).toBe(30);
    expect(result.dimensions.heightDifference).toBe(-10);
  });
});
