import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import type { AssetRegion } from '../types.js';

export async function extractImageAssets(
  imageBuffer: Buffer,
  regions: AssetRegion[],
  outputDir: string
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;
  const paths: string[] = [];

  for (const region of regions) {
    const left = Math.max(0, region.x);
    const top = Math.max(0, region.y);
    const right = Math.min(imageWidth, region.x + region.width);
    const bottom = Math.min(imageHeight, region.y + region.height);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) {
      console.warn(`[design-to-code] Skipping asset outside the image: ${region.name}`);
      continue;
    }

    const safeName = basename(region.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-'));
    const outputPath = join(outputDir, `${safeName || 'asset'}.png`);
    await sharp(imageBuffer)
      .extract({
        left,
        top,
        width,
        height,
      })
      .png()
      .toFile(outputPath);
    paths.push(outputPath);
  }

  return paths;
}
