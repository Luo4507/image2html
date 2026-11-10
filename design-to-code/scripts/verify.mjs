import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DesignToCode } from '../dist/index.js';
import {
  getDefaultCodegenOptions,
  getDefaultModelConfig,
  getDefaultValidationConfig,
} from '../dist/config.js';

const imagePath = process.argv[2] || 'examples/fixtures/login-design.png';
const outputDir = process.argv[3] || 'output';
const d2c = new DesignToCode();

function printError(error) {
  console.error('Error:', error);
  if (error?.cause) console.error('Cause:', error.cause);
}

try {
  await mkdir(outputDir, { recursive: true });

  console.log(`[1/4] Reading ${imagePath}`);
  const imageBuffer = await readFile(imagePath);
  const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  console.log('[2/4] Analyzing structure with Qwen VL');
  const structure = await d2c.analyzeStructure(imageBase64);
  await writeFile(`${outputDir}/structure.json`, JSON.stringify(structure, null, 2));
  console.log(`Structure saved: ${structure.components.length} components`);

  console.log('[3/4] Generating code with Qwen general model');
  const code = await d2c.generateCode(structure, {
    ...getDefaultCodegenOptions(),
    framework: 'html',
    styleFramework: 'inline',
    componentLibrary: 'none',
    typescript: false,
  });
  await writeFile(`${outputDir}/${code.filename}`, code.code);
  console.log(`Code saved: ${code.filename}`);

  console.log('[4/4] Rendering and comparing with original design');
  const validation = await d2c.validate(imageBuffer, code);
  await writeFile(`${outputDir}/validation.json`, JSON.stringify(validation, null, 2));
  if (validation.diffImage) {
    await writeFile(`${outputDir}/diff.png`, Buffer.from(validation.diffImage, 'base64'));
  }
  if (validation.screenshots.desktop) {
    await writeFile(
      `${outputDir}/rendered.png`,
      Buffer.from(validation.screenshots.desktop, 'base64')
    );
  }

  console.log(`Similarity: ${validation.similarity}%`);
  console.log(`Passed: ${validation.passed}`);
} catch (error) {
  printError(error);
  process.exitCode = 1;
} finally {
  await d2c.close();
}
