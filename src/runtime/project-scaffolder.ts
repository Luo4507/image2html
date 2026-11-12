import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { CodegenOptions, GeneratedCode } from '../types.js';
import { assertValidCodegenOptions } from './codegen-options.js';

const versions = {
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  vue: '^3.5.0',
  antd: '^5.0.0',
  'element-plus': '^2.9.0',
  vite: '^6.0.0',
  typescript: '^5.3.0',
  '@vitejs/plugin-react': '^4.7.0',
  '@vitejs/plugin-vue': '^5.2.4',
  '@types/react': '^18.3.0',
  '@types/react-dom': '^18.3.0',
  'vue-tsc': '^2.2.0',
  tailwindcss: '^3.4.17',
  postcss: '^8.5.32',
  autoprefixer: '^10.4.21',
};

function sourceFilename(generated: GeneratedCode, options: CodegenOptions): string {
  const extension = options.framework === 'react'
    ? options.typescript ? 'tsx' : 'jsx'
    : options.framework === 'vue' ? 'vue' : 'html';
  return basename(generated.filename || `GeneratedPage.${extension}`);
}

function manifest(options: CodegenOptions): string {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = { vite: versions.vite };

  if (options.framework === 'react') {
    dependencies.react = versions.react;
    dependencies['react-dom'] = versions['react-dom'];
    devDependencies['@vitejs/plugin-react'] = versions['@vitejs/plugin-react'];
    if (options.componentLibrary === 'antd') dependencies.antd = versions.antd;
    if (options.typescript) {
      devDependencies.typescript = versions.typescript;
      devDependencies['@types/react'] = versions['@types/react'];
      devDependencies['@types/react-dom'] = versions['@types/react-dom'];
    }
  } else if (options.framework === 'vue') {
    dependencies.vue = versions.vue;
    devDependencies['@vitejs/plugin-vue'] = versions['@vitejs/plugin-vue'];
    if (options.componentLibrary === 'element') dependencies['element-plus'] = versions['element-plus'];
    if (options.typescript) {
      devDependencies.typescript = versions.typescript;
      devDependencies['vue-tsc'] = versions['vue-tsc'];
    }
  }

  if (options.styleFramework === 'tailwind') {
    devDependencies.tailwindcss = versions.tailwindcss;
    devDependencies.postcss = versions.postcss;
    devDependencies.autoprefixer = versions.autoprefixer;
  }

  const typecheck = options.framework === 'vue' ? 'vue-tsc --noEmit' : 'tsc --noEmit';
  const build = options.framework !== 'html' && options.typescript
    ? `${typecheck} && vite build`
    : 'vite build';

  return `${JSON.stringify({
    name: 'image2html-generated-project',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build, preview: 'vite preview' },
    dependencies,
    devDependencies,
  }, null, 2)}\n`;
}

function tsconfig(options: CodegenOptions): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'Bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      strict: true,
      ...(options.framework === 'react' ? { jsx: 'react-jsx' } : {}),
    },
    include: ['src'],
  }, null, 2)}\n`;
}

function viteConfig(options: CodegenOptions): string {
  if (options.framework === 'react') {
    return `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`;
  }
  if (options.framework === 'vue') {
    return `import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\n\nexport default defineConfig({ plugins: [vue()] });\n`;
  }
  return `import { defineConfig } from 'vite';\n\nexport default defineConfig({});\n`;
}

function entry(options: CodegenOptions, filename: string): { name: string; content: string } {
  const extension = options.typescript ? 'ts' : 'js';
  const libraryStyle = options.componentLibrary === 'element'
    ? "import 'element-plus/dist/index.css';\n"
    : '';

  if (options.framework === 'react') {
    const importFilename = options.typescript ? filename.replace(/\.tsx$/, '') : filename;
    const name = `main.${options.typescript ? 'tsx' : 'jsx'}`;
    const root = options.typescript ? "document.getElementById('root')!" : "document.getElementById('root')";
    return {
      name,
      content: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport Component from './${importFilename}';\n${libraryStyle}import './index.css';\n\ncreateRoot(${root}).render(<Component />);\n`,
    };
  }

  return {
    name: `main.${extension}`,
    content: `import { createApp } from 'vue';\nimport Component from './${filename}';\n${libraryStyle}import './index.css';\n\ncreateApp(Component).mount('#root');\n`,
  };
}

/** Create the exact source/configuration map used by both validation and export. */
export function createFrameworkProjectFiles(
  generated: GeneratedCode,
  options: CodegenOptions,
): Record<string, string> {
  assertValidCodegenOptions(options);
  const filename = sourceFilename(generated, options);

  if (options.framework === 'html') {
    return {
      'package.json': manifest(options),
      'vite.config.ts': viteConfig(options),
      'index.html': generated.code,
    };
  }

  const main = entry(options, filename);
  const files: Record<string, string> = {
    'package.json': manifest(options),
    'vite.config.ts': viteConfig(options),
    'index.html': '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Generated Page</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/' + main.name + '"></script>\n</body>\n</html>\n',
    [`src/${filename}`]: generated.code,
    [`src/${main.name}`]: main.content,
    'src/index.css': options.styleFramework === 'tailwind'
      ? '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nhtml, body, #root { margin: 0; min-height: 100%; }\n'
      : 'html, body, #root { margin: 0; min-height: 100%; }\n',
  };

  if (options.typescript) {
    files['tsconfig.json'] = tsconfig(options);
    files['src/vite-env.d.ts'] = '/// <reference types="vite/client" />\n';
  }
  if (options.styleFramework === 'tailwind') {
    files['tailwind.config.cjs'] = '/** @type {import(\'tailwindcss\').Config} */\nmodule.exports = {\n  content: [\'./index.html\', \'./src/**/*.{js,ts,jsx,tsx,vue}\'],\n  theme: { extend: {} },\n  plugins: [],\n};\n';
    files['postcss.config.cjs'] = 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n';
  }

  return files;
}

/** Export a complete project without dependencies or build artifacts. */
export async function exportFrameworkProject(
  generated: GeneratedCode,
  options: CodegenOptions,
  outputDir: string,
): Promise<void> {
  const files = createFrameworkProjectFiles(generated, options);
  await Promise.all(Object.entries(files).map(async ([name, content]) => {
    const path = join(outputDir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }));
}



