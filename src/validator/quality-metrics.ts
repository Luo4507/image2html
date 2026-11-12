import type { VisualQualityMetrics } from '../types.js';

interface PixelInput {
  original: Buffer;
  generated: Buffer;
  width: number;
  height: number;
}

function colorDistance(a: Buffer, b: Buffer, index: number): number {
  const red = a[index] - b[index];
  const green = a[index + 1] - b[index + 1];
  const blue = a[index + 2] - b[index + 2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function luminance(pixels: Buffer, index: number): number {
  return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasNearbyEdge(
  edges: Uint8Array,
  pixel: number,
  width: number,
  height: number
): boolean {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
      if (edges[targetY * width + targetX]) return true;
    }
  }
  return false;
}

/** Calculate visual quality with extra weight on foreground content and edges. */
export function calculateQualityMetrics(input: PixelInput): VisualQualityMetrics {
  const { original, generated, width, height } = input;
  const totalPixels = width * height;
  const cornerIndexes = [0, width - 1, (height - 1) * width, height * width - 1];
  const background = [0, 1, 2].map((channel) =>
    cornerIndexes.reduce((sum, pixel) => sum + original[pixel * 4 + channel], 0) /
    cornerIndexes.length
  );

  let overallDiff = 0;
  let contentCount = 0;
  let contentDiff = 0;
  const originalEdges = new Uint8Array(totalPixels);
  const generatedEdges = new Uint8Array(totalPixels);

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * 4;
    const changed = colorDistance(original, generated, index) > 30;
    if (changed) overallDiff += 1;

    const red = original[index] - background[0];
    const green = original[index + 1] - background[1];
    const blue = original[index + 2] - background[2];
    const isContent = Math.sqrt(red * red + green * green + blue * blue) > 24;
    if (isContent) {
      contentCount += 1;
      if (changed) contentDiff += 1;
    }

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x === width - 1 || y === height - 1) continue;

    const right = index + 4;
    const down = index + width * 4;
    originalEdges[pixel] = Math.max(
      Math.abs(luminance(original, index) - luminance(original, right)),
      Math.abs(luminance(original, index) - luminance(original, down))
    ) > 40 ? 1 : 0;
    generatedEdges[pixel] = Math.max(
      Math.abs(luminance(generated, index) - luminance(generated, right)),
      Math.abs(luminance(generated, index) - luminance(generated, down))
    ) > 40 ? 1 : 0;
  }

  let originalEdgeCount = 0;
  let generatedEdgeCount = 0;
  let edgeMisses = 0;
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (originalEdges[pixel]) {
      originalEdgeCount += 1;
      if (!hasNearbyEdge(generatedEdges, pixel, width, height)) edgeMisses += 1;
    }
    if (generatedEdges[pixel]) {
      generatedEdgeCount += 1;
      if (!hasNearbyEdge(originalEdges, pixel, width, height)) edgeMisses += 1;
    }
  }

  const overallSimilarity = (1 - overallDiff / totalPixels) * 100;
  const contentSimilarity = contentCount === 0
    ? overallSimilarity
    : (1 - contentDiff / contentCount) * 100;
  const totalEdges = originalEdgeCount + generatedEdgeCount;
  const edgeSimilarity = totalEdges === 0 ? 100 : (1 - edgeMisses / totalEdges) * 100;
  const qualityScore = overallSimilarity * 0.4 + contentSimilarity * 0.35 + edgeSimilarity * 0.25;

  return {
    overallSimilarity: round(overallSimilarity),
    contentSimilarity: round(contentSimilarity),
    edgeSimilarity: round(edgeSimilarity),
    contentRatio: round(contentCount / totalPixels),
    qualityScore: round(qualityScore),
  };
}
