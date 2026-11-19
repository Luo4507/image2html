import sharp from 'sharp';

const [imgA, imgB] = process.argv.slice(2);
const a = await sharp(imgA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const metaA = await sharp(imgA).metadata();
const width = metaA.width, height = metaA.height;
// 模拟 compareImages：裁剪到公共尺寸后补白，不做非等比拉伸
const canvas = await sharp(imgB).extract({ left: 0, top: 0, width, height: Math.min(height, (await sharp(imgB).metadata()).height) })
  .extend({ top: 0, left: 0, right: 0, bottom: 0, background: '#ffffff' }).png().toBuffer();
const b = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const lum = (p, i) => p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
const total = width * height;
const edgesA = new Uint8Array(total);
const edgesB = new Uint8Array(total);
for (let px = 0; px < total; px++) {
  const x = px % width, y = (px / width) | 0;
  if (x === width - 1 || y === height - 1) continue;
  const i = px * 4;
  edgesA[px] = Math.max(Math.abs(lum(a.data, i) - lum(a.data, i + 4)), Math.abs(lum(a.data, i) - lum(a.data, i + width * 4))) > 40 ? 1 : 0;
  edgesB[px] = Math.max(Math.abs(lum(b.data, i) - lum(b.data, i + 4)), Math.abs(lum(b.data, i) - lum(b.data, i + width * 4))) > 40 ? 1 : 0;
}
const countA = edgesA.reduce((s, v) => s + v, 0);
const countB = edgesB.reduce((s, v) => s + v, 0);

function distanceToEdges(edges) {
  const dist = new Int32Array(total).fill(-1);
  const queue = [];
  for (let px = 0; px < total; px++) if (edges[px]) { dist[px] = 0; queue.push(px); }
  let head = 0;
  while (head < queue.length) {
    const px = queue[head++];
    const x = px % width, y = (px / width) | 0;
    const d = dist[px] + 1;
    if (x > 0 && dist[px - 1] < 0) { dist[px - 1] = d; queue.push(px - 1); }
    if (x < width - 1 && dist[px + 1] < 0) { dist[px + 1] = d; queue.push(px + 1); }
    if (y > 0 && dist[px - width] < 0) { dist[px - width] = d; queue.push(px - width); }
    if (y < height - 1 && dist[px + width] < 0) { dist[px + width] = d; queue.push(px + width); }
  }
  return dist;
}
const distA = distanceToEdges(edgesA);
const distB = distanceToEdges(edgesB);

console.log(`edges original=${countA} generated=${countB} totalPixels=${total}`);
for (const r of [1, 2, 3, 4, 6, 8]) {
  let miss = 0;
  for (let px = 0; px < total; px++) {
    if (edgesA[px] && distB[px] > r) miss++;
    if (edgesB[px] && distA[px] > r) miss++;
  }
  const edgeSim = (1 - miss / (countA + countB)) * 100;
  const q = 91.18 * 0.4 + 91.21 * 0.35 + edgeSim * 0.25;
  console.log(`r=${r}: edgeSimilarity=${edgeSim.toFixed(2)}  -> qualityScore=${q.toFixed(2)}  gate(edge>=40)=${edgeSim >= 40}`);
}
