import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DesignToCode, exportFrameworkProject } from '../dist/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/config.js';

const imagePath = process.argv[2];
const failedDir = process.argv[3];
const framework = process.argv[4];
const outputDir = process.argv[5] || `${failedDir}-repaired`;

if (!imagePath || !failedDir || !['react', 'vue'].includes(framework)) {
  throw new Error('Usage: node scripts/repair-failed-framework.mjs <image> <failed-dir> <react|vue> [output-dir]');
}

const filename = framework === 'react' ? 'Generatedpage.tsx' : 'Generatedpage.vue';
const currentCode = {
  code: await readFile(join(failedDir, filename), 'utf8'),
  filename,
  imports: [],
  components: [],
};
const diagnostic = JSON.parse(await readFile(join(failedDir, 'error.json'), 'utf8')).error;
const options = {
  ...getDefaultCodegenOptions(),
  framework,
  styleFramework: framework === 'react' ? 'tailwind' : 'inline',
  componentLibrary: framework === 'react' ? 'antd' : 'element',
  typescript: true,
  qualityMode: 'balanced',
  assetMode: 'none',
};
const converter = new DesignToCode();
await mkdir(outputDir, { recursive: true });

try {
  console.log(`[compile-repair] repairing ${framework} source`);
  const repaired = await converter.repairCodeWithDiagnostics(currentCode, diagnostic, options);
  await writeFile(join(outputDir, filename), repaired.code, 'utf8');
  await exportFrameworkProject(repaired, options, join(outputDir, 'project'));

  console.log('[compile-repair] build and original-image validation');
  const validation = await converter.validate(await readFile(imagePath), repaired, options);
  await writeFile(join(outputDir, 'validation.json'), JSON.stringify(validation, null, 2));
  if (validation.screenshots.desktop) {
    await writeFile(join(outputDir, 'rendered.png'), Buffer.from(validation.screenshots.desktop, 'base64'));
  }
  if (validation.diffImage) {
    await writeFile(join(outputDir, 'diff.png'), Buffer.from(validation.diffImage, 'base64'));
  }
  const summary = {
    framework,
    repaired: true,
    similarity: validation.similarity,
    qualityScore: validation.quality?.qualityScore,
    passed: validation.passed,
    regions: validation.regions.length,
  };
  await writeFile(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[compile-repair] success similarity=${validation.similarity}% passed=${validation.passed}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(join(outputDir, 'error.json'), JSON.stringify({ error: message }, null, 2));
  console.error(`[compile-repair] failed: ${message}`);
  process.exitCode = 1;
} finally {
  await converter.close();
}
