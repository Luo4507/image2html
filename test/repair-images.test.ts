import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createRepairImageContext } from '../src/validator/repair-images.js';

describe('repair image context', () => {
  it('crops the region with the most differing pixels in all three images', async () => {
    const source = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const regions = [
      { x: 0, y: 0, width: 20, height: 20, diffPercentage: 90, diffPixels: 100, type: 'header' as const },
      { x: 50, y: 25, width: 50, height: 50, diffPercentage: 40, diffPixels: 500, type: 'main' as const },
    ];
    const result = await createRepairImageContext({
      originalBase64: source.toString('base64'), renderedBase64: source.toString('base64'),
      diffBase64: source.toString('base64'), regions,
    });
    expect(result.focusRegion).toEqual(regions[1]);
    expect(result.images).toHaveLength(3);
    for (const image of result.images) {
      const metadata = await sharp(Buffer.from(image, 'base64')).metadata();
      expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 50, height: 50 });
    }
  });

  it('expands a 1px edge region to a centered 16x16 model input', async () => {
    const pixel = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const source = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    }).composite([{ input: pixel, left: 19, top: 19 }]).png().toBuffer();
    const result = await createRepairImageContext({
      originalBase64: source.toString('base64'),
      regions: [{ x: 19, y: 19, width: 1, height: 1, diffPercentage: 100, diffPixels: 1, type: 'main' }],
    });
    const image = sharp(Buffer.from(result.images[0], 'base64'));
    const metadata = await image.metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 16, height: 16 });
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const index = (15 * info.width + 15) * info.channels;
    expect({ r: data[index], g: data[index + 1], b: data[index + 2] }).toEqual({ r: 255, g: 0, b: 0 });
  });
});
