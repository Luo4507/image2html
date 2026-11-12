# Asset Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let opt-in conversions generate and validate code that references extracted image assets.

**Architecture:** Conversion reads existing extractor output into `GeneratedAsset` values and passes a fixed asset manifest to model prompts. Shared project writers place assets in `public/assets`; HTML validation inlines the same bytes only for screenshots.

**Tech Stack:** TypeScript, Sharp, Vite, Playwright, Vitest.

---

### Task 1: Asset model and project output

- [ ] Add failing tests for `GeneratedAsset`, safe asset filenames and byte-identical `public/assets` export.
- [ ] Extend `CodegenOptions` and `GeneratedCode` with optional asset fields.
- [ ] Implement shared asset writing in project export and Vite runtime; run focused tests.

### Task 2: Conversion and prompt integration

- [ ] Add failing conversion tests for `assetMode: extract`, manifest propagation, model-call accounting, empty assets and cleanup.
- [ ] Implement in-memory extraction and framework prompt manifests without changing the default `none` path.
- [ ] Add CLI `--extract-assets` and documentation; run all tests and typecheck.

### Task 3: Validation and regression

- [ ] Add failing React `/assets` browser-loading and HTML pixel-comparison tests.
- [ ] Implement Vite public asset output and HTML validation-only data URL substitution.
- [ ] Run the full suite and production build.
- [ ] Run a real `extract` conversion, inspect rendered/diff images serially, and report build and quality status separately.
