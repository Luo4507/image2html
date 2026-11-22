import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  DesignToCode,
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/index.js';

const examplesDir = 'examples';
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
if (outputIndex >= 0 && !args[outputIndex + 1]) {
  throw new Error('--output 后必须提供结果目录');
}
const optionIndexes = new Set(outputIndex >= 0 ? [outputIndex, outputIndex + 1] : []);
const requestedFiles = args.filter((_, index) => !optionIndexes.has(index));
const outputRoot = outputIndex >= 0 ? args[outputIndex + 1] : join(examplesDir, 'results');
const availableFiles = (await readdir(examplesDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'zh-CN'));
const missingFiles = requestedFiles.filter((file) => !availableFiles.includes(file));
if (missingFiles.length > 0) throw new Error(`示例图片不存在: ${missingFiles.join(', ')}`);
const files = requestedFiles.length > 0 ? requestedFiles : availableFiles;

if (files.length === 0) throw new Error('examples 目录没有可测试的图片');

const options = getDefaultCodegenOptions();
const modelConfig = getDefaultModelConfig();
const validationConfig = getDefaultValidationConfig();
const startedAt = Date.now();
const summary = [];

await mkdir(outputRoot, { recursive: true });
console.log(`[batch] ${files.length} images: ${files.join(', ')}`);
console.log(`[batch] quality=${options.qualityMode}, maxRetries=${validationConfig.maxRetryCount}, textCoverage=${validationConfig.checkTextCoverage}`);

function compactValidation(validation) {
  if (!validation) return undefined;
  const { screenshots, diffImage, ...data } = validation;
  return data;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
}

function seconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (value / 1000).toFixed(1) : '—';
}

for (const [index, file] of files.entries()) {
  const imagePath = join(examplesDir, file);
  const name = basename(file, file.slice(file.lastIndexOf('.')));
  const outputDir = join(outputRoot, name);
  const itemStartedAt = Date.now();
  const converter = new DesignToCode({
    modelConfig,
    validationConfig,
  });
  let result;

  await mkdir(outputDir, { recursive: true });
  console.log(`\n[${index + 1}/${files.length}] ${file} started`);

  try {
    result = await converter.convert({
      image: { source: imagePath, type: 'path', filename: file },
      options,
      modelConfig,
      validationConfig,
      onProgress(event) {
        if (event.stage !== 'preview') {
          console.log(`[${file}] ${event.stage}: ${event.message}`);
        }
      },
    });
  } catch (error) {
    result = {
      success: false,
      code: { code: '', filename: '', imports: [], components: [] },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await converter.close();
  }

  if (result.code?.code) {
    const filename = basename(result.code.filename || `${name}.tsx`);
    await writeFile(join(outputDir, filename), result.code.code, 'utf8');
  }

  if (result.validation) {
    const { screenshots, diffImage } = result.validation;
    for (const viewport of ['desktop', 'tablet', 'mobile']) {
      if (screenshots?.[viewport]) {
        await writeFile(join(outputDir, `rendered-${viewport}.png`), Buffer.from(screenshots[viewport], 'base64'));
      }
    }
    if (diffImage) {
      await writeFile(join(outputDir, 'diff.png'), Buffer.from(diffImage, 'base64'));
    }
  }

  const record = {
    image: imagePath,
    options,
    success: result.success,
    code: result.code ? {
      filename: result.code.filename,
      imports: result.code.imports,
      components: result.code.components,
    } : undefined,
    validation: compactValidation(result.validation),
    metrics: result.metrics,
    qualityHistory: result.qualityHistory?.map((entry) => ({
      ...entry,
      validation: compactValidation(entry.validation),
    })),
    compileHistory: result.compileHistory,
    error: result.error,
    totalMs: result.metrics?.totalMs ?? Date.now() - itemStartedAt,
  };
  await writeFile(join(outputDir, 'result.json'), JSON.stringify(record, null, 2), 'utf8');

  summary.push(record);
  console.log(`[${file}] finished success=${result.success} passed=${result.validation?.passed} similarity=${result.validation?.similarity ?? '—'} elapsed=${seconds(record.totalMs)}s`);
}

const report = {
  startedAt: new Date(startedAt).toISOString(),
  finishedAt: new Date().toISOString(),
  totalMs: Date.now() - startedAt,
  models: {
    vision: modelConfig.visionModel.model,
    code: modelConfig.codeModel.model,
  },
  options,
  validationConfig,
  results: summary,
};
await writeFile(join(outputRoot, 'summary.json'), JSON.stringify(report, null, 2), 'utf8');

const lines = [
  '# 示例图片批量测试报告',
  '',
  `- 开始时间：${report.startedAt}`,
  `- 结束时间：${report.finishedAt}`,
  `- 视觉模型：${modelConfig.visionModel.model}`,
  `- 通用模型：${modelConfig.codeModel.model}`,
  `- 生成配置：${options.framework} / ${options.styleFramework} / ${options.componentLibrary} / ${options.pipeline} / ${options.qualityMode}`,
  `- 图片数量：${files.length}`,
  '',
  '| 图片 | 执行成功 | 视觉通过 | 整图相似度 | 质量分 | 内容相似度 | 边缘相似度 | 文字覆盖率 | 修复轮次 | 模型调用 | 耗时（秒） | 详细结果 |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
];

for (const item of summary) {
  const name = basename(item.image, item.image.slice(item.image.lastIndexOf('.')));
  const validation = item.validation;
  const metrics = item.metrics;
  lines.push(`| ${basename(item.image)} | ${item.success ? '是' : '否'} | ${validation ? (validation.passed ? '是' : '否') : '—'} | ${number(validation?.similarity)} | ${number(validation?.quality?.qualityScore)} | ${number(validation?.quality?.contentSimilarity)} | ${number(validation?.quality?.edgeSimilarity)} | ${number(validation?.textCoverage)} | ${metrics?.repairIterations ?? '—'} | ${metrics?.modelCalls ?? '—'} | ${seconds(item.totalMs)} | [结果](${name}/result.json) |`);
}

const failures = summary.filter((item) => !item.success);
if (failures.length > 0) {
  lines.push('', '## 执行失败原因', '');
  for (const item of failures) lines.push(`- ${basename(item.image)}：${item.error || '未知错误'}`);
}
lines.push('', '> 执行成功与视觉验收通过是两个独立结论；最终质量以各项门禁和人工检查为准。', '');
await writeFile(join(outputRoot, 'summary.md'), lines.join('\n'), 'utf8');

console.log(`\n[batch] report: ${join(outputRoot, 'summary.md')}`);
console.log(`[batch] completed in ${seconds(report.totalMs)}s`);
if (summary.some((item) => !item.success)) process.exitCode = 1;
