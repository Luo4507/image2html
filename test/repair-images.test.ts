import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createRepairImageContext } from '../src/validator/repair-images.js';

describe('repair image context', () => {
  it('keeps full-page images and appends crops of the worst region', async () => {
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
    // 3 full-page sources followed by 3 focused crops
    expect(result.images).toHaveLength(6);
    for (const image of result.images.slice(0, 3)) {
      const metadata = await sharp(Buffer.from(image, 'base64')).metadata();
      expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 200, height: 100 });
    }
    for (const image of result.images.slice(3)) {
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
    // images[0] is the full source, images[1] is the expanded crop
    const image = sharp(Buffer.from(result.images[1], 'base64'));
    const metadata = await image.metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 16, height: 16 });
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const index = (15 * info.width + 15) * info.channels;
    expect({ r: data[index], g: data[index + 1], b: data[index + 2] }).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns only full sources when no regions are provided', async () => {
    const source = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const result = await createRepairImageContext({
      originalBase64: source.toString('base64'), renderedBase64: source.toString('base64'),
      regions: [],
    });
    expect(result.images).toHaveLength(2);
    expect(result.focusRegion).toBeUndefined();
  });
});