import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseQualityBaseline, recommendQualityGates } from '../dist/validator/quality-baseline.js';

const baselinePath = process.argv[2] || 'quality/baseline.json';
const summaryPath = process.argv[3] || 'output/demo-validation/summary.json';
const outputPath = process.argv[4] || 'quality/calibration-report.json';

const baseline = parseQualityBaseline(
  JSON.parse(await readFile(baselinePath, 'utf8'))
);
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const labels = new Map(baseline.samples.map((sample) => [sample.image, sample.label]));
const measurements = summary
  .filter((result) => labels.has(result.image))
  .map((result) => ({
    label: labels.get(result.image),
    overallSimilarity: result.similarity,
    contentSimilarity: result.contentSimilarity,
    edgeSimilarity: result.edgeSimilarity,
  }));

const accepted = measurements.filter((sample) => sample.label === 'accepted');
const report = {
  createdAt: new Date().toISOString(),
  baselineStatus: baseline.status,
  sampleCount: measurements.length,
  acceptedCount: accepted.length,
  currentGates: baseline.gates,
  recommendedGates: accepted.length ? recommendQualityGates(measurements) : null,
  note: 'Recommendations are based on the current baseline labels. Review labels before changing release gates.',
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
