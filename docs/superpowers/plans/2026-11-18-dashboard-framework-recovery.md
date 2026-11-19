# Dashboard React/Vue Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the observed Dashboard React type failure and Vue Element Plus mount failure, then prove both paths with real model generation.

**Architecture:** Share the Ant Design 5.0.0 API contract between generation and repair. Register Element Plus in the common Vue project entry and attach bounded browser diagnostics to empty mounts.

**Tech Stack:** TypeScript, React 18, Ant Design 5.0.0, Vue 3, Element Plus, Vite, Playwright, Vitest.

**Design:** `docs/superpowers/specs/2026-11-18-dashboard-framework-recovery-design.md`

---

## File map

- Create `src/prompts/component-library-contract.ts` for shared API constraints.
- Modify `src/prompts/direct-generation.ts` and `src/prompts/compile-repair.ts` to consume them.
- Create `test/component-library-contract.test.ts` for both prompt paths.
- Modify `src/runtime/project-scaffolder.ts` and `test/project-scaffolder.test.ts` for conditional Element Plus registration.
- Modify `test/vite-runtime.test.ts` for real React/Vue runtime regressions.
- Modify `src/validator/visual-validator.ts` and `test/render-readiness.test.ts` for empty-mount diagnostics.
- Append observed evidence to the design document only after real verification.

### Task 1: Share the Ant Design Breadcrumb contract

**Files:** `test/component-library-contract.test.ts`, `src/prompts/component-library-contract.ts`, `src/prompts/direct-generation.ts`, `src/prompts/compile-repair.ts`

- [ ] **Step 1: Add failing tests**

Create `test/component-library-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDirectGenerationPrompt } from '../src/prompts/direct-generation.js';
import { buildCompileRepairPrompt } from '../src/prompts/compile-repair.js';
import type { CodegenOptions } from '../src/types.js';

const reactAntd: CodegenOptions = {
  framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd',
  typescript: true, responsive: true, accessibility: true,
};
function expectContract(prompt: string): void {
  expect(prompt).toContain('Ant Design 5.0.0');
  expect(prompt).toContain('<Breadcrumb.Item>');
  expect(prompt).toMatch(/Breadcrumb[^\n]*不得使用 `items`/);
}

describe('component library API contracts', () => {
  it('uses the installed Breadcrumb API in generation and repair', () => {
    expectContract(buildDirectGenerationPrompt(reactAntd));
    expectContract(buildCompileRepairPrompt({
      current: { code: 'export default function Broken() {}', filename: 'Broken.tsx', imports: [], components: [] },
      options: reactAntd,
      diagnostics: "Property 'items' does not exist on type 'BreadcrumbProps'",
    }));
  });
  it('omits Ant Design rules when no library is selected', () => {
    expect(buildDirectGenerationPrompt({ ...reactAntd, componentLibrary: 'none' }))
      .not.toContain('Ant Design 5.0.0');
  });
});
```

- [ ] **Step 2: Verify RED**

Run `node_modules/.bin/vitest run test/component-library-contract.test.ts`. Expect failure because the version and Breadcrumb restriction are absent.

- [ ] **Step 3: Implement the shared contract**

Create `src/prompts/component-library-contract.ts`:

```ts
import type { CodegenOptions } from '../types.js';

export function buildComponentLibraryContract(
  options: Pick<CodegenOptions, 'framework' | 'componentLibrary'>,
): string {
  if (options.framework === 'react' && options.componentLibrary === 'antd') {
    return '- 当前运行时为 Ant Design 5.0.0；`Breadcrumb` 必须使用 `<Breadcrumb><Breadcrumb.Item>...</Breadcrumb.Item></Breadcrumb>` 子节点写法，不得使用 `items` 属性。';
  }
  return '';
}
```

Import `buildComponentLibraryContract` from `./component-library-contract.js` in both prompt modules. In `buildFrameworkContract()` add `${buildComponentLibraryContract(options)}` on its own line after the React icon whitelist. In the repair template add the same expression between `## 修复要求` and the framework contract. Leave all existing rules unchanged.

- [ ] **Step 4: Verify GREEN and review**

Run `node_modules/.bin/vitest run test/component-library-contract.test.ts test/direct-generation.test.ts test/compile-repair.test.ts`. Expect 3 files PASS. Run `git diff -- src/prompts test/component-library-contract.test.ts`; expect only this task's changes. Do not commit without an explicit owner request.

### Task 2: Register Element Plus in Vue projects

**Files:** `test/project-scaffolder.test.ts`, `src/runtime/project-scaffolder.ts`

- [ ] **Step 1: Add failing template assertions**

In the existing Vue + Element Plus test add:

```ts
expect(files['src/main.ts']).toContain("import ElementPlus from 'element-plus';");
expect(files['src/main.ts']).toContain("import 'element-plus/dist/index.css';");
expect(files['src/main.ts']).toContain('createApp(Component).use(ElementPlus).mount');
```

Add a no-library control:

```ts
it('does not register Element Plus when Vue uses no component library', () => {
  const files = createFrameworkProjectFiles(generated({
    code: '<template><main>Plain Vue</main></template><script setup lang="ts"></script>',
    filename: 'Demo.vue', components: [],
  }), options({ framework: 'vue', styleFramework: 'inline', componentLibrary: 'none' }));
  expect(files['src/main.ts']).not.toContain('ElementPlus');
  expect(files['src/main.ts']).toContain("createApp(Component).mount('#root')");
});
```

- [ ] **Step 2: Verify RED**

Run `node_modules/.bin/vitest run test/project-scaffolder.test.ts`. Expect failure because `.use(ElementPlus)` is absent.

- [ ] **Step 3: Implement the minimal entry change**

In `entry()` replace `libraryStyle` with:

```ts
const usesElementPlus = options.componentLibrary === 'element';
const libraryImports = usesElementPlus
  ? "import ElementPlus from 'element-plus';\nimport 'element-plus/dist/index.css';\n"
  : '';
```

Use `${libraryImports}` in the React entry. For Vue use:

```ts
const mountTarget = usesElementPlus
  ? 'createApp(Component).use(ElementPlus)'
  : 'createApp(Component)';
return {
  name: `main.${extension}`,
  content: `import { createApp } from 'vue';\nimport Component from './${filename}';\n${libraryImports}import './index.css';\n\n${mountTarget}.mount('#root');\n`,
};
```

- [ ] **Step 4: Verify GREEN**

Run `node_modules/.bin/vitest run test/project-scaffolder.test.ts`. Expect all scaffold tests PASS, including the no-library control.

### Task 3: Add real React and Vue runtime regressions

**Files:** `test/vite-runtime.test.ts`

- [ ] **Step 1: Add the React compatibility control**

```ts
it('renders the Ant Design 5.0.0 Breadcrumb children API', async () => {
  await expectRenderedText(
    generated("import { Breadcrumb } from 'antd'; export default function Demo() { return <Breadcrumb><Breadcrumb.Item>Dashboard crumb</Breadcrumb.Item></Breadcrumb>; }", 'Demo.tsx'),
    options({ styleFramework: 'tailwind', componentLibrary: 'antd' }),
    'Dashboard crumb',
  );
}, 60_000);
```

Run `node_modules/.bin/vitest run test/vite-runtime.test.ts -t "Breadcrumb children API"`. Expect PASS, proving the required API fits the installed dependency.

- [ ] **Step 2: Add the Vue global-component regression**

```ts
it('renders globally registered Element Plus components without SFC imports', async () => {
  const running = await startFrameworkProject(
    generated('<template><el-button type="primary">Global Element Plus ready</el-button></template><script setup lang="ts"></script>', 'Demo.vue'),
    options({ framework: 'vue', componentLibrary: 'element' }),
  );
  const page = await browser.newPage();
  try {
    await page.goto(running.url, { waitUntil: 'networkidle' });
    const button = page.locator('#root button.el-button');
    await button.waitFor({ timeout: 5000 });
    expect(await button.textContent()).toContain('Global Element Plus ready');
  } finally {
    await page.close();
    await running.close();
  }
}, 60_000);
```

Run `node_modules/.bin/vitest run test/vite-runtime.test.ts -t "globally registered Element Plus"`. Expect PASS after Task 2 with a real `button.el-button`; without registration it only renders an unresolved `el-button` tag.

- [ ] **Step 3: Run all runtime tests**

Run `node_modules/.bin/vitest run test/vite-runtime.test.ts`. Expect all runtime tests PASS and temporary projects removed.

### Task 4: Add bounded diagnostics for empty mounts

**Files:** `test/render-readiness.test.ts`, `src/validator/visual-validator.ts`

- [ ] **Step 1: Add the failing diagnostic test**

```ts
it('includes browser warnings when a framework root stays empty', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<div id="root"></div><script>console.warn("missing component registration")</script>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const validator = new VisualValidator(getDefaultValidationConfig());
  cleanup.push(() => validator.close());

  await expect((validator as any).renderHtml(
    { content: url, isUrl: true, framework: 'vue' },
    { width: 400, height: 300 },
  )).rejects.toThrow(/#root is empty after mount[\s\S]*missing component registration/);
}, 10_000);
```

- [ ] **Step 2: Verify RED**

Run `node_modules/.bin/vitest run test/render-readiness.test.ts -t "includes browser warnings"`. Expect failure because the warning is not included.

- [ ] **Step 3: Implement bounded collection**

In `renderHtml()` add beside `runtimeErrors`:

```ts
const browserDiagnostics: string[] = [];
```

Register beside the `pageerror` listener:

```ts
page.on('console', (message) => {
  if (!['error', 'warning', 'warn'].includes(message.type()) || browserDiagnostics.length >= 20) return;
  browserDiagnostics.push(`${message.type()}: ${message.text().slice(0, 500)}`);
});
```

Replace only the empty-mount throw:

```ts
if (!mounted) {
  const details = browserDiagnostics.length > 0
    ? `\nBrowser diagnostics: ${browserDiagnostics.join('; ')}`
    : '';
  throw new Error(`${label} render failed: #root is empty after mount${details}`);
}
```

Keep `pageerror` handling ahead of the mount check unchanged.

- [ ] **Step 4: Verify GREEN**

Run `node_modules/.bin/vitest run test/render-readiness.test.ts`. Expect all readiness tests PASS and successful warning-only pages unaffected.

### Task 5: Run complete offline verification

- [ ] **Step 1: Typecheck**

Run `node_modules/.bin/tsc -p tsconfig.json --noEmit`. Expect exit 0 and no diagnostics.

- [ ] **Step 2: Run every test**

Run `node_modules/.bin/vitest run`. Expect all test files and tests PASS with zero failures.

- [ ] **Step 3: Build**

Run `node scripts/clean.mjs && node_modules/.bin/tsc -p tsconfig.json`. Expect exit 0 and regenerated `dist/` modules.

- [ ] **Step 4: Review the diff**

Run `git diff --check && git status --short`. Expect no whitespace errors; only planned documents/source/tests plus the pre-existing untracked `examples/demo/results/` are present. Do not stage or commit without an explicit owner request.

### Task 6: Regenerate Dashboard with real models

**Files:** existing script creates `output/dashboard-framework-recovery/{summary.json,react/*,vue/*}`; update the design document with observed results.

- [ ] **Step 1: Run fresh React and Vue conversion**

Run `node scripts/verify-frameworks.mjs examples/demo/dashboard.png output/dashboard-framework-recovery react,vue`.

Expect both targets `completed` and exit 0. Visual `passed=false` is acceptable; `success=false`, build errors, runtime errors, or empty mounts are not.

- [ ] **Step 2: Assert persisted evidence**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const s=JSON.parse(fs.readFileSync('output/dashboard-framework-recovery/summary.json','utf8')); if(s.targets.length!==2||s.targets.some(t=>!t.success)) throw new Error(JSON.stringify(s)); for(const f of ['react','vue']) { for(const name of ['validation.json','metrics.json','rendered.png']) { const p='output/dashboard-framework-recovery/'+f+'/'+name; if(!fs.existsSync(p)||fs.statSync(p).size===0) throw new Error('Missing '+p); } } console.log(JSON.stringify(s,null,2));"
```

Expect exit 0 and successful React/Vue records with validation, metrics, and nonempty screenshots.

- [ ] **Step 3: Record actual completion results**

Append `## 完成结果` to the design document. Copy actual test file/test counts and each target's success, similarity, quality score, gate result, model calls, and repair iterations from generated artifacts. Preserve any failed visual gate result. Do not mark P0 complete if either real target failed.

- [ ] **Step 4: Final check**

Run `git diff --check && git status --short && node dist/cli.js --help`. Expect no whitespace errors, a working CLI, all intended files visible, and no generated `output/` artifacts staged or committed.
