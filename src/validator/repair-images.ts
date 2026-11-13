import sharp from 'sharp';
import type { DiffRegion } from '../types.js';

function buffer(base64: string): Buffer {
  return Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
}

export async function createRepairImageContext(input: {
  originalBase64: string;
  renderedBase64?: string;
  diffBase64?: string;
  regions: DiffRegion[];
}): Promise<{ images: string[]; focusRegion?: DiffRegion }> {
  const focusRegion = [...input.regions].sort((a, b) => b.diffPixels - a.diffPixels)[0];
  const sources = [input.originalBase64, input.renderedBase64, input.diffBase64]
    .filter((value): value is string => Boolean(value));
  if (!focusRegion) return { images: sources };

  const images = await Promise.all(sources.map(async (source) => {
    const image = sharp(buffer(source));
    const metadata = await image.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;
    const regionLeft = Math.max(0, Math.min(focusRegion.x, imageWidth - 1));
    const regionTop = Math.max(0, Math.min(focusRegion.y, imageHeight - 1));
    const regionWidth = Math.max(1, Math.min(focusRegion.width, imageWidth - regionLeft));
    const regionHeight = Math.max(1, Math.min(focusRegion.height, imageHeight - regionTop));
    const width = Math.min(imageWidth, Math.max(16, regionWidth));
    const height = Math.min(imageHeight, Math.max(16, regionHeight));
    const centerX = regionLeft + regionWidth / 2;
    const centerY = regionTop + regionHeight / 2;
    const left = Math.max(0, Math.min(Math.floor(centerX - width / 2), imageWidth - width));
    const top = Math.max(0, Math.min(Math.floor(centerY - height / 2), imageHeight - height));
    const cropped = await image.extract({ left, top, width, height }).extend({
      top: 0,
      left: 0,
      right: Math.max(0, 16 - width),
      bottom: Math.max(0, 16 - height),
      background: '#ffffff',
    }).png().toBuffer();
    return cropped.toString('base64');
  }));
  return { images, focusRegion };
}
