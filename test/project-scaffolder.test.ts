import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CodegenOptions, GeneratedCode } from '../src/types.js';
import { createFrameworkProjectFiles, exportFrameworkProject } from '../src/runtime/project-scaffolder.js';

function options(overrides: Partial<CodegenOptions> = {}): CodegenOptions {
  return {
    framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd',
    typescript: true, responsive: true, accessibility: true, ...overrides,
  };
}

function generated(overrides: Partial<GeneratedCode> = {}): GeneratedCode {
  return {
    code: 'export default function Demo() { return <main>Demo</main>; }',
    filename: 'Demo.tsx', imports: [], components: ['Demo'], ...overrides,
  };
}

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('framework project scaffolder', () => {
  it('creates a React TypeScript Tailwind Ant Design project', () => {
    const files = createFrameworkProjectFiles(generated(), options());
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      'package.json', 'index.html', 'vite.config.ts', 'tsconfig.json',
      'tailwind.config.cjs', 'postcss.config.cjs', 'src/main.tsx', 'src/index.css', 'src/Demo.tsx',
    ]));
    expect(files['src/main.tsx']).toContain("import Component from './Demo'");
    expect(files['src/main.tsx']).toContain('createRoot');
    expect(files['src/index.css']).toContain('@tailwind base');
    expect(files['package.json']).toContain('"antd"');
    expect(files['package.json']).toContain('"react"');
  });

  it('creates a Vue TypeScript inline Element Plus project', () => {
    const files = createFrameworkProjectFiles(generated({
      code: '<template><main>Vue</main></template><script setup lang="ts"></script>',
      filename: 'Demo.vue', components: [],
    }), options({ framework: 'vue', styleFramework: 'inline', componentLibrary: 'element' }));

    expect(files['src/main.ts']).toContain('createApp');
    expect(files['src/main.ts']).toContain("import Component from './Demo.vue'");
    expect(files['src/Demo.vue']).toContain('<template>');
    expect(files['package.json']).toContain('"element-plus"');
    expect(files['tailwind.config.cjs']).toBeUndefined();
  });

  it('uses JavaScript entry files and normalizes the generated filename', () => {
    const files = createFrameworkProjectFiles(generated({
      code: 'export default function Demo() { return <main>JS</main>; }',
      filename: '../unsafe/Demo.jsx',
    }), options({ typescript: false, componentLibrary: 'none' }));

    expect(files['src/main.jsx']).toContain("import Component from './Demo.jsx'");
    expect(files['src/Demo.jsx']).toBeDefined();
    expect(files['src/unsafe/Demo.jsx']).toBeUndefined();
    expect(files['tsconfig.json']).toBeUndefined();
  });

  it('exports extracted assets with safe names and identical bytes', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'image2html-assets-test-'));
    cleanup.push(outputDir);
    const data = Buffer.from([0, 1, 2, 3, 255]).toString('base64');
    await exportFrameworkProject(generated({
      assets: [{ name: '../logo.png', mimeType: 'image/png', data }],
    }), options(), outputDir);

    const asset = await readFile(join(outputDir, 'public', 'assets', 'logo.png'));
    expect(asset).toEqual(Buffer.from([0, 1, 2, 3, 255]));
  });
  it('exports only project source and configuration files', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'image2html-project-test-'));
    cleanup.push(outputDir);
    await exportFrameworkProject(generated(), options(), outputDir);

    const manifest = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8'));
    expect(manifest.dependencies.react).toBeDefined();
    expect(await readFile(join(outputDir, 'src', 'Demo.tsx'), 'utf8')).toContain('Demo');
    expect(await readFile(join(outputDir, 'src', 'main.tsx'), 'utf8')).toContain('createRoot');
  });
});
