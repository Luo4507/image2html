import type { DiffRegion } from '../types.js';

function classifyRegion(x: number, y: number, width: number, height: number): DiffRegion['type'] {
  if (y < height * 0.1) return 'header';
  if (y > height * 0.9) return 'footer';
  if (x < width * 0.2) return 'sidebar';
  return 'main';
}

/** Aggregate an existing pixelmatch mask without repeatedly decoding crops. */
export function aggregateDiffRegions(
  diffMask: Buffer,
  width: number,
  height: number,
  gridSize = 100
): DiffRegion[] {
  const counts = new Map<string, number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = diffMask[(y * width + x) * 4 + 3];
      if (!alpha) continue;

      const left = Math.floor(x / gridSize) * gridSize;
      const top = Math.floor(y / gridSize) * gridSize;
      const key = `${left},${top}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const regions: DiffRegion[] = [];
  for (const [key, diffPixels] of counts) {
    const [x, y] = key.split(',').map(Number);
    const regionWidth = Math.min(gridSize, width - x);
    const regionHeight = Math.min(gridSize, height - y);
    const diffPercentage = (diffPixels / (regionWidth * regionHeight)) * 100;
    if (diffPercentage <= 10) continue;

    regions.push({
      x,
      y,
      width: regionWidth,
      height: regionHeight,
      diffPixels,
      diffPercentage: Math.round(diffPercentage * 100) / 100,
      type: classifyRegion(x, y, width, height),
    });
  }

  return regions;
}
