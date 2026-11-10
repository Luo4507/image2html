# Standard Project Structure Implementation Plan

> **For agentic workers:** Execute the tasks in order and verify each result before continuing.

**Goal:** Convert the nested prototype into a standard Node.js/TypeScript package and add an MIT open-source license.

**Architecture:** Hoist the package to the repository root, separate production code from tests, and retain examples, verification scripts, generated output, and documentation in conventional directories. Package metadata exposes the library, CLI, and MCP entry points without changing runtime behavior.

**Tech Stack:** Node.js 20+, TypeScript, pnpm, Vitest, MCP SDK, Playwright.

---

### Task 1: Standardize directories

**Files:**
- Move `design-to-code/src/` to `src/`
- Move `design-to-code/scripts/` to `scripts/`
- Move `design-to-code/examples/` to `examples/`
- Move co-located `*.test.ts` files to `test/`
- Move `design-to-code-solution.md` to `docs/design-to-code-solution.md`
- Move package configuration and environment files to the repository root

- [ ] Verify all source and destination paths resolve inside `F:\code\image2html`.
- [ ] Move files with PowerShell `Move-Item -LiteralPath` without crossing shells.
- [ ] Update test imports to reference `../src/`.

### Task 2: Standardize package metadata and documentation

**Files:**
- Modify `package.json`
- Modify `tsconfig.json`
- Modify `.gitignore`
- Create `README.md`
- Create `LICENSE`

- [ ] Set package name to `image2html`, license to `MIT`, Node engine to `>=20`, and package manager to pnpm.
- [ ] Add `main`, `types`, `exports`, `bin`, `files`, `verify`, and `verify:mcp` entries.
- [ ] Keep `dist`, `node_modules`, `.env`, and generated output out of Git; track `pnpm-lock.yaml`.
- [ ] Add the MIT license text and root setup/usage/project-structure documentation.

### Task 3: Verify the restructured package

**Files:**
- Verify `test/*.test.ts`
- Verify `scripts/verify-mcp.mjs`

- [ ] Run `pnpm install` and confirm it exits successfully.
- [ ] Run `pnpm typecheck` and confirm zero TypeScript errors.
- [ ] Run `pnpm test` and confirm all three existing tests pass.
- [ ] Run `pnpm build` and confirm `dist/` is generated.
- [ ] Run `pnpm verify:mcp` and confirm the four MCP tools are discovered and visual validation returns a similarity score.
- [ ] Inspect `git status` and confirm `.env`, credentials, dependencies, and generated output are not staged.
