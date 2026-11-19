import sharp from 'sharp';
const [imgA, imgB, outMap] = process.argv.slice(2);
const a = await sharp(imgA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const width = a.info.width, height = a.info.height;
const canvas = await sharp(imgB).extract({ left: 0, top: 0, width, height: Math.min(height, (await sharp(imgB).metadata()).height) })
  .extend({ top: 0, left: 0, right: 0, bottom: 0, background: '#ffffff' }).png().toBuffer();
const b = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const lum = (p, i) => p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
const total = width * height;
const edgesA = new Uint8Array(total), edgesB = new Uint8Array(total);
for (let px = 0; px < total; px++) {
  const x = px % width, y = (px / width) | 0;
  if (x === width - 1 || y === height - 1) continue;
  const i = px * 4;
  edgesA[px] = Math.max(Math.abs(lum(a.data, i) - lum(a.data, i + 4)), Math.abs(lum(a.data, i) - lum(a.data, i + width * 4))) > 40 ? 1 : 0;
  edgesB[px] = Math.max(Math.abs(lum(b.data, i) - lum(b.data, i + 4)), Math.abs(lum(b.data, i) - lum(b.data, i + width * 4))) > 40 ? 1 : 0;
}
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
const distA = distanceToEdges(edgesA), distB = distanceToEdges(edgesB);
const R = 3;
// 半透明叠加：底图=原图，蓝色=匹配上的边缘，红色=miss 边缘（双侧）
const out = Buffer.from(a.data);
for (let px = 0; px < total; px++) {
  const i = px * 4;
  let matched = false, missed = false;
  if (edgesA[px]) { (distB[px] <= R ? matched = true : missed = true); }
  if (edgesB[px] && distA[px] > R) missed = true;
  if (missed) { out[i] = 255; out[i+1] = 40; out[i+2] = 40; }
  else if (matched) { out[i] = 60; out[i+1] = 120; out[i+2] = 255; }
}
await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(outMap);
// 分块统计 miss 密度（12 列 x 10 行）
const cols = 12, rows = 10;
const missMap = Array.from({ length: rows }, () => new Array(cols).fill(0));
const cntMap = Array.from({ length: rows }, () => new Array(cols).fill(0));
for (let px = 0; px < total; px++) {
  const x = px % width, y = (px / width) | 0;
  const cx = Math.min(cols - 1, (x / width * cols) | 0), cy = Math.min(rows - 1, (y / height * rows) | 0);
  if (edgesA[px] || edgesB[px]) cntMap[cy][cx]++;
  if ((edgesA[px] && distB[px] > R) || (edgesB[px] && distA[px] > R)) missMap[cy][cx]++;
}
console.log('miss density % (rows=top->bottom, cols=left->right):');
for (let cy = 0; cy < rows; cy++) {
  console.log(missMap[cy].map((m, cx) => cntMap[cy][cx] ? String(Math.round(m / cntMap[cy][cx] * 100)).padStart(3) : '  .').join(' '));
}
