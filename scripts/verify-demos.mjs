import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DesignToCode } from '../dist/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/config.js';

const fixturesDir = process.argv[2] || 'examples/demo';
const outputDir = process.argv[3] || 'output/demo-validation';
const imageFiles = (await readdir(fixturesDir))
  .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  .sort();

await mkdir(outputDir, { recursive: true });
const results = [];

for (const filename of imageFiles) {
  const name = basename(filename);
  const imagePath = join(fixturesDir, filename);
  const artifactDir = join(outputDir, basename(filename, '.png'));
  await mkdir(artifactDir, { recursive: true });

  console.log(`\n[demo] ${name} started`);
  const converter = new DesignToCode();
  let lastStage = '';

  try {
    const result = await converter.convert({
      image: { source: imagePath, type: 'path', filename },
      options: {
        ...getDefaultCodegenOptions(),
        framework: 'html',
        styleFramework: 'inline',
        componentLibrary: 'none',
        typescript: false,
        pipeline: 'direct',
        qualityMode: 'balanced',
      },
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
      onProgress(event) {
        if (event.stage !== lastStage) {
          lastStage = event.stage;
          console.log(`[demo] ${name}: ${event.stage}`);
        }
      },
    });

    if (!result.success) throw new Error(result.error || 'Conversion failed');

    await writeFile(join(artifactDir, result.code.filename), result.code.code);
    await writeFile(
      join(artifactDir, 'metrics.json'),
      JSON.stringify(result.metrics, null, 2)
    );
    if (result.qualityHistory) {
      await writeFile(
        join(artifactDir, 'quality-history.json'),
        JSON.stringify(result.qualityHistory, null, 2)
      );
    }

    if (result.structure) {
      await writeFile(
        join(artifactDir, 'structure.json'),
        JSON.stringify(result.structure, null, 2)
      );
    }
    if (result.validation) {
      await writeFile(
        join(artifactDir, 'validation.json'),
        JSON.stringify(result.validation, null, 2)
      );
      if (result.validation.screenshots.desktop) {
        await writeFile(
          join(artifactDir, 'rendered.png'),
          Buffer.from(result.validation.screenshots.desktop, 'base64')
        );
      }
      if (result.validation.diffImage) {
        await writeFile(
          join(artifactDir, 'diff.png'),
          Buffer.from(result.validation.diffImage, 'base64')
        );
      }
    }

    const row = {
      image: name,
      success: true,
      similarity: result.validation?.similarity,
      qualityScore: result.validation?.quality?.qualityScore,
      contentSimilarity: result.validation?.quality?.contentSimilarity,
      edgeSimilarity: result.validation?.quality?.edgeSimilarity,
      passed: result.validation?.passed,
      modelCalls: result.metrics?.modelCalls,
      repairIterations: result.metrics?.repairIterations,
      totalSeconds: result.metrics ? result.metrics.totalMs / 1000 : undefined,
    };
    results.push(row);
    console.log(
      `[demo] ${name}: similarity=${row.similarity}%, quality=${row.qualityScore}, passed=${row.passed}, time=${row.totalSeconds}s`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ image: name, success: false, error: message });
    console.error(`[demo] ${name} failed: ${message}`);
  } finally {
    await converter.close();
  }
}

await writeFile(
  join(outputDir, 'summary.json'),
  JSON.stringify(results, null, 2)
);

const lines = [
  '# Demo 图片验证报告',
  '',
  `验证时间：${new Date().toISOString()}`,
  '',
  '| 图片 | 状态 | 相似度 | 质量分 | 内容分 | 边缘分 | 模型调用 | 修复轮次 | 耗时(s) |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];

for (const result of results) {
  if (!result.success) {
    lines.push(`| ${result.image} | 失败 | - | - | - | - | - | - | - |`);
    continue;
  }
  lines.push(
    `| ${result.image} | ${result.passed ? '通过' : '未通过'} | ${result.similarity ?? '-'} | ${result.qualityScore ?? '-'} | ${result.contentSimilarity ?? '-'} | ${result.edgeSimilarity ?? '-'} | ${result.modelCalls ?? '-'} | ${result.repairIterations ?? '-'} | ${result.totalSeconds?.toFixed(1) ?? '-'} |`
  );
}

await writeFile(join(outputDir, 'README.md'), lines.join('\n'));

const succeeded = results.filter((result) => result.success).length;
const passed = results.filter((result) => result.passed).length;
console.log(`\n[demo] completed=${succeeded}/${results.length}, qualityPassed=${passed}/${results.length}`);
console.log(`[demo] report: ${join(outputDir, 'README.md')}`);
