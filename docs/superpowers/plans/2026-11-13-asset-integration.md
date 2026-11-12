# Asset Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let opt-in conversions generate and validate code that references extracted image assets.

**Architecture:** Conversion reads existing extractor output into `GeneratedAsset` values and passes a fixed asset manifest to model prompts. Shared project writers place assets in `public/assets`; HTML validation inlines the same bytes only for screenshots.

**Tech Stack:** TypeScript, Sharp, Vite, Playwright, Vitest.

**Status (2026-11-13):** Completed. 24 test files / 67 tests pass. Real React extract conversion produced nine public assets and ten asset references, completed Vite rendering with three model calls, and scored 93.44% overall similarity; the strict visual quality gate remains unpassed.

---

### Task 1: Asset model and project output

- [x] Add failing tests for `GeneratedAsset`, safe asset filenames and byte-identical `public/assets` export.
- [x] Extend `CodegenOptions` and `GeneratedCode` with optional asset fields.
- [x] Implement shared asset writing in project export and Vite runtime; run focused tests.

### Task 2: Conversion and prompt integration

- [x] Add failing conversion tests for `assetMode: extract`, manifest propagation, model-call accounting, empty assets and cleanup.
- [x] Implement in-memory extraction and framework prompt manifests without changing the default `none` path.

- [x] Add CLI `--extract-assets` and documentation; run all tests and typecheck.

### Task 3: Validation and regression

- [x] Add failing React `/assets` browser-loading and HTML pixel-comparison tests.
- [x] Implement Vite public asset output and HTML validation-only data URL substitution.
- [x] Run the full suite and production build.
- [x] Run a real `extract` conversion, inspect rendered/diff images serially, and report build and quality status separately.
