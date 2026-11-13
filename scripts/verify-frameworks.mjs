import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DesignToCode, exportFrameworkProject } from '../dist/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/config.js';

const imagePath = process.argv[2] || 'examples/demo/login.png';
const outputRoot = process.argv[3] || 'output/framework-verification';
const targets = [
  { name: 'html', framework: 'html', styleFramework: 'inline', componentLibrary: 'none', typescript: false },
  { name: 'react', framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd', typescript: true },
  { name: 'vue', framework: 'vue', styleFramework: 'inline', componentLibrary: 'element', typescript: true },
];

const requestedTargets = process.argv[4]?.split(',').filter(Boolean);
const assetMode = process.argv[5] === 'extract' ? 'extract' : 'none';
const layoutMode = process.argv[6] === 'segmented' ? 'segmented' : 'single';
const selectedTargets = requestedTargets?.length
  ? targets.filter((target) => requestedTargets.includes(target.name))
  : targets;

await mkdir(outputRoot, { recursive: true });
const summary = [];

for (const target of selectedTargets) {
  const outputDir = join(outputRoot, target.name);
  await mkdir(outputDir, { recursive: true });
  const converter = new DesignToCode();
  const startedAt = Date.now();
  console.log(`\n[framework:${target.name}] started`);

  try {
    const options = {
      ...getDefaultCodegenOptions(),
      framework: target.framework,
      styleFramework: target.styleFramework,
      componentLibrary: target.componentLibrary,
      typescript: target.typescript,
      pipeline: 'direct',
      qualityMode: 'balanced',
      assetMode,
      layoutMode,
    };
    const result = await converter.convert({
      image: { source: imagePath, type: 'path' },
      options,
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
      onProgress(event) {
        if (event.stage !== 'preview') console.log(`[framework:${target.name}] ${event.stage}: ${event.message}`);
      },
    });

    if (result.code.code) {
      await writeFile(join(outputDir, result.code.filename), result.code.code, 'utf8');
      await exportFrameworkProject(result.code, options, join(outputDir, 'project'));
    }
    await writeFile(join(outputDir, 'metrics.json'), JSON.stringify(result.metrics, null, 2));
    if (!result.success) throw new Error(result.error || 'Conversion failed');
    if (result.compileHistory) {
      await writeFile(join(outputDir, 'compile-history.json'), JSON.stringify(result.compileHistory, null, 2));
    }
    if (result.qualityHistory) {
      await writeFile(join(outputDir, 'quality-history.json'), JSON.stringify(result.qualityHistory, null, 2));
    }
    if (result.validation) {
      await writeFile(join(outputDir, 'validation.json'), JSON.stringify(result.validation, null, 2));
      if (result.validation.diffImage) {
        await writeFile(join(outputDir, 'diff.png'), Buffer.from(result.validation.diffImage, 'base64'));
      }
      if (result.validation.screenshots.desktop) {
        await writeFile(join(outputDir, 'rendered.png'), Buffer.from(result.validation.screenshots.desktop, 'base64'));
      }
    }

    summary.push({
      framework: target.name,
      success: true,
      similarity: result.validation?.similarity,
      qualityScore: result.validation?.quality?.qualityScore,
      passed: result.validation?.passed,
      modelCalls: result.metrics?.modelCalls,
      repairIterations: result.metrics?.repairIterations,
      totalMs: result.metrics?.totalMs,
    });
    console.log(`[framework:${target.name}] completed similarity=${result.validation?.similarity}% passed=${result.validation?.passed}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.push({ framework: target.name, success: false, error: message, totalMs: Date.now() - startedAt });
    await writeFile(join(outputDir, 'error.json'), JSON.stringify({ error: message }, null, 2));
    console.error(`[framework:${target.name}] failed: ${message}`);
  } finally {
    await converter.close();
  }
}

await writeFile(join(outputRoot, 'summary.json'), JSON.stringify({ imagePath, targets: summary }, null, 2));
console.log(`\n[framework] report: ${join(outputRoot, 'summary.json')}`);
if (summary.some((target) => !target.success)) process.exitCode = 1;
