import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { build, preview, type InlineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import type { CodegenOptions, GeneratedCode } from '../types.js';
import { createFrameworkProjectFiles } from './project-scaffolder.js';

const require = createRequire(import.meta.url);
const packageRoot = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const packageNodeModules = join(packageRoot, 'node_modules');

export interface RunningFrameworkProject {
  url: string;
  projectDir: string;
  close: () => Promise<void>;
}

function dependencyAliases(): Array<{ find: RegExp; replacement: string }> {
  return [
    { find: /^react$/, replacement: require.resolve('react') },
    { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
    { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve('react/jsx-dev-runtime') },
    { find: /^react-dom$/, replacement: require.resolve('react-dom') },
    { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') },
    { find: /^vue$/, replacement: require.resolve('vue') },
    { find: /^antd$/, replacement: require.resolve('antd') },
    { find: /^@ant-design\/icons$/, replacement: require.resolve('@ant-design/icons') },
    { find: /^element-plus$/, replacement: require.resolve('element-plus') },
    { find: /^@element-plus\/icons-vue$/, replacement: require.resolve('@element-plus/icons-vue') },
    { find: /^element-plus\/dist\/index.css$/, replacement: require.resolve('element-plus/dist/index.css') },
  ];
}

function viteConfig(projectDir: string, options: CodegenOptions): InlineConfig {
  const frameworkPlugin = options.framework === 'react' ? react() : vue();
  return {
    root: projectDir,
    configFile: false,
    logLevel: 'silent',
    plugins: [frameworkPlugin],
    resolve: { alias: dependencyAliases() },
    css: options.styleFramework === 'tailwind'
      ? {
          postcss: {
            plugins: [
              tailwindcss({
                content: [join(projectDir, 'index.html'), join(projectDir, 'src', '**', '*.{js,ts,jsx,tsx,vue}')],
              }),
              autoprefixer(),
            ],
          },
        }
      : undefined,
    build: { outDir: 'dist', emptyOutDir: true },
  };
}

async function runTypecheck(projectDir: string, options: CodegenOptions): Promise<void> {
  if (!options.typescript || options.framework === 'html') return;

  const configPath = join(projectDir, 'tsconfig.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.compilerOptions.baseUrl = packageNodeModules;
  config.compilerOptions.typeRoots = [join(packageNodeModules, '@types')];
  config.compilerOptions.paths = {
    react: ['@types/react'],
    'react/jsx-runtime': ['@types/react/jsx-runtime'],
    'react/jsx-dev-runtime': ['@types/react/jsx-dev-runtime'],
    'react-dom': ['@types/react-dom'],
    'react-dom/client': ['@types/react-dom/client'],
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

  const executable = options.framework === 'vue'
    ? require.resolve('vue-tsc/bin/vue-tsc')
    : require.resolve('typescript/bin/tsc');
  const label = options.framework === 'vue' ? 'Vue' : 'React';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [executable, '--noEmit', '-p', configPath], {
      cwd: projectDir,
      windowsHide: true,
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} typecheck timed out`));
    }, 45_000);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${label} typecheck failed: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${label} typecheck failed:\n${output.trim()}`));
    });
  });
}

/** Typecheck and production-build an existing generated project. */
export async function buildFrameworkProject(
  projectDir: string,
  options: CodegenOptions,
): Promise<void> {
  const label = options.framework === 'vue' ? 'Vue' : 'React';
  await runTypecheck(projectDir, options);
  try {
    await build(viteConfig(projectDir, options));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} Vite build failed: ${message}`);
  }
}

/** Build a generated component and serve its production bundle on loopback. */
export async function startFrameworkProject(
  generated: GeneratedCode,
  options: CodegenOptions,
): Promise<RunningFrameworkProject> {
  if (options.framework === 'html') {
    throw new Error('HTML does not require the Vite framework runtime');
  }

  const projectDir = await mkdtemp(join(tmpdir(), 'image2html-runtime-'));
  try {
    const files = createFrameworkProjectFiles(generated, options);
    // Runtime builds inject PostCSS/Tailwind inline; config files are for exported projects.
    delete files['postcss.config.cjs'];
    delete files['tailwind.config.cjs'];
    await Promise.all(Object.entries(files).map(async ([name, content]) => {
      const path = join(projectDir, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
    }));

    await buildFrameworkProject(projectDir, options);
    const server = await preview({
      root: projectDir,
      configFile: false,
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    const address = server.httpServer.address() as AddressInfo;
    let closed = false;

    return {
      url: `http://127.0.0.1:${address.port}`,
      projectDir,
      close: async () => {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve, reject) => {
          server.httpServer.close((error) => error ? reject(error) : resolve());
        });
        await rm(projectDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(projectDir, { recursive: true, force: true });
    throw error;
  }
}
