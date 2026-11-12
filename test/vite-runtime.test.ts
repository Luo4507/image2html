import 'dotenv/config';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodegenOptions, GeneratedCode } from '../src/types.js';
import { startFrameworkProject } from '../src/runtime/vite-runtime.js';

function options(overrides: Partial<CodegenOptions> = {}): CodegenOptions {
  return {
    framework: 'react', styleFramework: 'inline', componentLibrary: 'none',
    typescript: true, responsive: true, accessibility: true, ...overrides,
  };
}

function generated(code: string, filename: string): GeneratedCode {
  return { code, filename, imports: [], components: [] };
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});
afterAll(async () => { await browser?.close(); });

async function expectRenderedText(
  generatedCode: GeneratedCode,
  target: CodegenOptions,
  text: string,
) {
  const running = await startFrameworkProject(generatedCode, target);
  const projectDir = running.projectDir;
  const page = await browser.newPage();
  try {
    await page.goto(running.url, { waitUntil: 'networkidle' });
    expect(await page.locator('#root').textContent()).toContain(text);
  } finally {
    await page.close();
    await running.close();
  }
  expect(existsSync(projectDir)).toBe(false);
}

describe('Vite framework runtime', () => {
  it('typechecks, builds and serves a React TypeScript component', async () => {
    await expectRenderedText(
      generated("import { Button } from 'antd'; export default function Demo() { return <Button type=\"primary\" className=\"p-4\">React runtime ready</Button>; }", 'Demo.tsx'),
      options({ styleFramework: 'tailwind', componentLibrary: 'antd' }),
      'React runtime ready',
    );
  }, 60_000);

  it('typechecks, builds and serves a Vue TypeScript SFC', async () => {
    await expectRenderedText(
      generated("<template><ElButton type=\"primary\">Vue runtime ready</ElButton></template><script setup lang=\"ts\">import { ElButton } from 'element-plus';</script>", 'Demo.vue'),
      options({ framework: 'vue', componentLibrary: 'element' }),
      'Vue runtime ready',
    );
  }, 60_000);

  it('serves React JavaScript', async () => {
    await expectRenderedText(
      generated('export default function Demo() { return <main>React JS ready</main>; }', 'Demo.jsx'),
      options({ typescript: false }),
      'React JS ready',
    );
  }, 60_000);

  it('rejects invalid React source with a stage-specific error', async () => {
    await expect(startFrameworkProject(
      generated('export default function Demo() { return <main>; }', 'Broken.tsx'),
      options(),
    )).rejects.toThrow(/React.*(typecheck|build)/i);
  }, 60_000);

  it('rejects invalid Vue source with a stage-specific error', async () => {
    await expect(startFrameworkProject(
      generated('<template><main></template><script setup lang="ts"></script>', 'Broken.vue'),
      options({ framework: 'vue', componentLibrary: 'element' }),
    )).rejects.toThrow(/Vue.*(typecheck|build)/i);
  }, 60_000);
});


