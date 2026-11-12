import { mkdir, writeFile } from 'node:fs/promises';
import { DesignToCode } from '../dist/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/config.js';

const imagePath = process.argv[2] || 'examples/fixtures/demo/login.png';
const outputDir = process.argv[3] || 'output/direct-verification';
const d2c = new DesignToCode();

try {
  await mkdir(outputDir, { recursive: true });
  console.log(`[verify] Converting ${imagePath}`);

  const result = await d2c.convert({
    image: { source: imagePath, type: 'path' },
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
  });

  if (!result.success) throw new Error(result.error || 'Conversion failed');

  await writeFile(`${outputDir}/${result.code.filename}`, result.code.code);
  await writeFile(`${outputDir}/metrics.json`, JSON.stringify(result.metrics, null, 2));

  if (result.structure) {
    await writeFile(`${outputDir}/structure.json`, JSON.stringify(result.structure, null, 2));
  }
  if (result.validation) {
    await writeFile(
      `${outputDir}/validation.json`,
      JSON.stringify(result.validation, null, 2)
    );
    if (result.validation.diffImage) {
      await writeFile(
        `${outputDir}/diff.png`,
        Buffer.from(result.validation.diffImage, 'base64')
      );
    }
    if (result.validation.screenshots.desktop) {
      await writeFile(
        `${outputDir}/rendered.png`,
        Buffer.from(result.validation.screenshots.desktop, 'base64')
      );
    }
  }

  console.log(`Code saved: ${result.code.filename}`);
  console.log(`Similarity: ${result.validation?.similarity ?? 'not validated'}%`);
  console.log(`Model calls: ${result.metrics?.modelCalls}`);
  console.log(`Total time: ${result.metrics?.totalMs}ms`);
  console.log(`Repair iterations: ${result.metrics?.repairIterations}`);
} catch (error) {
  console.error('Error:', error);
  if (error?.cause) console.error('Cause:', error.cause);
  process.exitCode = 1;
} finally {
  await d2c.close();
}
