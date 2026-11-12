# React/Vue Runtime Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make generated React and Vue components compile and render in real Vite projects, reuse visual validation, export complete projects, and prove the behavior with automated and real-image regression tests.

**Architecture:** A framework-aware scaffolder creates the same project for validation and export. A Vite runtime builds and serves React/Vue projects while HTML keeps the existing `page.setContent()` path. Option guards reject unsupported combinations before model calls; no generic regex component rewrite is applied to generated source.

**Tech Stack:** TypeScript, Node.js 20+, Vite 6, React 18, Vue 3, Ant Design 5, Element Plus, Tailwind CSS 3, Playwright, Vitest.

---

## File structure

- `src/runtime/codegen-options.ts`: runtime-independent compatibility validation.
- `src/runtime/project-scaffolder.ts`: pure project-file creation and safe export.
- `src/runtime/vite-runtime.ts`: typecheck, Vite build, preview, diagnostics and cleanup.
- `src/prompts/direct-generation.ts`: framework-specific output contracts.
- `src/validator/visual-validator.ts`: HTML or URL rendering and browser error checks.
- `src/index.ts`: pass target options, use safe post-processing, close runtimes.
- `src/cli.ts`: opt-in complete-project export.
- `test/runtime-options.test.ts`: compatibility and filename behavior.
- `test/project-scaffolder.test.ts`: project content and export behavior.
- `test/vite-runtime.test.ts`: real React/Vue build and rendering.
- `test/visual-validator-frameworks.test.ts`: end-to-end screenshots through the validator.

### Task 1: Lock the supported option matrix

**Files:** Create `src/runtime/codegen-options.ts`, `test/runtime-options.test.ts`; modify `src/index.ts`.

- [x] **Write failing tests** for React+antd, Vue+element, HTML+none acceptance; React+element, Vue+antd, HTML+antd, React/Vue+scss/css-modules, and non-HTML segmented rejection. Add React `.jsx` and `.tsx` filename cases through the public conversion finalizer behavior.
- [x] **Run** `node node_modules/vitest/vitest.mjs run test/runtime-options.test.ts` and confirm failure because the module does not exist.
- [x] **Implement** `assertValidCodegenOptions(options: CodegenOptions): void` with messages naming the invalid combination. Keep HTML style behavior unchanged.
- [x] **Call the guard at the start of** `convert()`, `generateCode()`, and `generateDirectCode()` so public entry points cannot bypass it.
- [x] **Change** `generateFilename(title, framework, typescript)` to return `.jsx` for React JavaScript and `.tsx` for React TypeScript; update its caller.
- [x] **Re-run the focused test, all tests, and typecheck.** Expect the new tests and existing 33 tests to pass.

### Task 2: Create framework-specific generation contracts and safe post-processing

**Files:** Modify `src/prompts/direct-generation.ts`, `src/index.ts`; create `test/direct-generation.test.ts`.

- [x] **Write failing prompt tests** asserting React requires a default-exported component and `.tsx`-compatible output, Vue requires a legal SFC with `template` and `script setup`, and neither permits arbitrary external packages.
- [x] **Implement framework-specific prompt sections** while preserving the existing visual fidelity instructions.
- [x] **Add a failing regression test** showing structured React source is not prefixed with an HTML `<style>` block or rewritten by `ComponentMapper`.
- [x] **Change finalization** so `TokenMapper` only runs for HTML and `ComponentMapper` is no longer called. Keep both classes exported for API compatibility.
- [x] **Run focused tests and the full suite.** Confirm existing HTML/token tests remain green.

### Task 3: Build the shared project scaffolder and exporter

**Files:** Create `src/runtime/project-scaffolder.ts`, `test/project-scaffolder.test.ts`; export the new API from `src/index.ts`.

- [x] **Write failing tests** for React TS+tailwind+antd and Vue TS+inline+element file maps. Assert `package.json`, `index.html`, Vite config, `src/main`, generated source and required style config are present.
- [x] **Implement** `createFrameworkProjectFiles(code, options)` returning `Record<string, string>`. Use fixed entry files and basename the generated filename to prevent path traversal.
- [x] **Implement** `exportFrameworkProject(code, options, outputDir)` using `mkdir({recursive:true})` and UTF-8 writes; do not create `node_modules` or `dist`.
- [x] **Add tests** for React JavaScript entry/imports, Vue JavaScript SFC, filename traversal normalization, and unsupported option rejection.
- [x] **Run** `node node_modules/vitest/vitest.mjs run test/project-scaffolder.test.ts` and then typecheck.

### Task 4: Install and lock runtime dependencies

**Files:** Modify `package.json`, `pnpm-lock.yaml`.

- [x] **Add runtime dependencies** `react@^18.3.1`, `react-dom@^18.3.1`, `vue@^3.5.0`, `antd@^5.0.0`, `element-plus@^2.9.0`, `vite@^6.0.0`, `@vitejs/plugin-react@^4.3.0`, `@vitejs/plugin-vue@^5.2.0`, `tailwindcss@^3.4.0`, `postcss@^8.4.0`, `autoprefixer@^10.4.0`, and `vue-tsc@^2.2.0`.
- [x] **Add development types** `@types/react@^18.3.0` and `@types/react-dom@^18.3.0`.
- [x] **Install with pnpm 10.33.0** and verify `node_modules/.pnpm/lock.yaml` is consistent. Do not commit `.pnpm-store` or `node_modules`.
- [x] **Run the full existing suite and typecheck** before adding runtime code.

### Task 5: Implement the Vite runtime with real diagnostics

**Files:** Create `src/runtime/vite-runtime.ts`, `test/vite-runtime.test.ts`.

- [x] **Write failing integration tests** using fixed components: React TS renders “React runtime ready”; Vue TS renders “Vue runtime ready”; invalid JSX and invalid SFC reject with a framework/stage message.
- [x] **Implement** `buildFrameworkProject(projectDir, options)` with framework plugins, Vite `build()`, and React `tsc --noEmit` or Vue `vue-tsc --noEmit` when TypeScript is enabled.
- [x] **Implement** `startFrameworkProject(code, options)` returning `{url, close}`. Create a temporary directory, write the shared scaffold, typecheck/build, start Vite preview on an ephemeral loopback port, and remove the directory after preview closes.
- [x] **Resolve generated-project imports to this package's installed dependencies** using `createRequire(import.meta.url)` and explicit Vite aliases/base configuration; temporary directories must not depend on the caller's working directory.
- [x] **Verify failure cleanup** by asserting temporary directories are removed after successful and failed runs.
- [x] **Run the focused integration tests.** Expect real builds and rendered text, with no model calls.

### Task 6: Route visual validation through HTML or Vite

**Files:** Modify `src/validator/visual-validator.ts`, `src/index.ts`; create `test/visual-validator-frameworks.test.ts`.

- [x] **Write failing validator tests** that pass a fixed React component and a fixed Vue SFC with target options and assert non-empty desktop/tablet/mobile screenshots and finite similarity metrics.
- [x] **Refactor page capture** to accept either raw HTML or a running URL. URL rendering uses `page.goto()`, waits for fonts, collects `pageerror`, and requires non-empty `#root` content for React/Vue.
- [x] **Start one framework runtime per validation**, reuse it for all requested viewports, and close it in `finally`.
- [x] **Pass `request.options` from conversion and add an optional target argument to public `validate()`**; existing callers without a target continue to use HTML.
- [x] **Add a failing-runtime test** for empty React output and verify the error is surfaced rather than producing a misleading similarity score.
- [x] **Run all unit/integration tests, typecheck, and build.**

### Task 7: Add CLI project export and documentation

**Files:** Modify `src/cli.ts`, `README.md`, `.env.example`; create `test/cli-project.test.ts` if CLI test helpers are introduced.

- [x] **Add a failing CLI parsing/handler test** for `--project` if a handler seam exists; otherwise cover the underlying exporter and manually verify the CLI command.
- [x] **Add `--project`** so `image2html convert input.png --framework react --project --output output/react-demo` exports the complete scaffold instead of only a component.
- [x] **Document the compatibility matrix**, JavaScript/TypeScript behavior, supported styles, build/render flow and project export commands. Mark SCSS/CSS Modules for React/Vue as rejected in this version.
- [x] **Build and run CLI help** to verify the new option is visible.

### Task 8: Full automated and real-image regression

**Files:** Create `scripts/verify-frameworks.mjs`; modify `package.json`; write results under ignored `output/` directories.

- [x] **Create a verification script** accepting an image and output root, running HTML+inline+none, React+TypeScript+antd, and Vue+TypeScript+element sequentially, writing source, metrics, validation and screenshots for each.
- [x] **Run all tests, typecheck and build** and record exact counts.
- [x] **Run fixed-component React/Vue integration tests again** to prove the merged result independently of model output.
- [x] **Run the real-image script against** `F:\testdata\img2html\电鸭.png`; inspect original/rendered/diff images one at a time, never in parallel.
- [x] **Export React and Vue projects and run their production builds**, recording any model-generated syntax or dependency errors instead of silently editing them away.
- [x] **Update README with verification status** and commit only source, tests, docs and lockfile changes.

**Status (2026-11-13):** Tasks 1-8 completed. 23 test files / 60 tests pass; typecheck and production build pass. Real image builds succeeded for HTML, React, and Vue; exported React/Vue projects independently built successfully. Visual quality gates remain unpassed and are reported honestly.

---

### Task 9: Continue with the independent fifth-stage tasks

**Files:** New task-specific plans under `docs/superpowers/plans/`.

- [ ] **Plan and implement asset integration** with tests proving extracted assets are referenced by generated projects.
- [ ] **Plan and implement API parity** with tests for MCP `threshold`, HTTP pipeline/quality/layout options, and validation before model calls.
- [ ] **Plan and implement persistent job recovery** with restart tests for queued/running/completed jobs and cache state.
- [ ] **Run the complete regression suite after each independent task** rather than treating this shared runtime plan as proof of those features.

