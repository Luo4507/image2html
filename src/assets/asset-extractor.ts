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
    if (region.x + region.width > imageWidth || region.y + region.height > imageHeight) {
      throw new Error(`Asset region is outside the image: ${region.name}`);
    }

    const safeName = basename(region.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-'));
    const outputPath = join(outputDir, `${safeName || 'asset'}.png`);
    await sharp(imageBuffer)
      .extract({
        left: region.x,
        top: region.y,
        width: region.width,
        height: region.height,
      })
      .png()
      .toFile(outputPath);
    paths.push(outputPath);
  }

  return paths;
}
