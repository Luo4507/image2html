# Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Improve real visual consistency through accurate comparison, actionable diagnostics, region-aware repair and framework-neutral long-page generation.

**Architecture:** Extend the existing validator with dimension and layout metadata, focus visual repair on the worst region with a validated full-code fallback, and generalize the segmented generator to React/Vue without changing the shared Vite runtime.

**Tech Stack:** TypeScript, Sharp, Pixelmatch, Playwright, Vite, Vitest.

**Status (2026-11-13):** Completed. 29 test files / 84 tests pass. Real regression covered Juejing and Dianya across HTML/React/Vue, compiler recovery, region-focused fallback, and segmented long-page generation. Latest Dianya similarities: HTML 92.04%, React 93.04%, Vue 92.99%. Juejing positioned segmented similarities: React 92.73%, Vue 92.24% with safe single-page fallback. Direct repaired Vue reached 92.63%. No strict visual quality gate passed; dimension and layout diagnostics are retained for future tuning.

---

### Task 1: Distortion-free comparison

- [x] Add failing pixel tests for shorter/taller generated screenshots and dimension metadata.
- [x] Implement crop/pad normalization without stretching and expose dimensions in validation results.

### Task 2: Layout diagnostics

- [x] Add failing browser tests for element bounds and computed styles.
- [x] Capture a bounded layout snapshot and include it in visual repair prompts.

### Task 3: Region-aware repair and safe fallback

- [x] Add failing tests for worst-region crop selection, patch failure fallback, model-call accounting and score-based rejection.
- [x] Implement repair-image cropping, focused prompts and full-code visual fallback.

### Task 4: Segmented React/Vue generation

- [x] Add failing assembly and runtime tests for multi-region React and Vue output.
- [x] Implement framework-specific region prompts and assembly; remove the old HTML-only guard.

### Task 5: Regression and real-image verification

- [x] Run all tests, typecheck and production build after each stage.
- [x] Backtest Juejing and Dianya across frameworks and exercise segmented long-page generation.
- [x] Update documentation with actual build, visual gate and repair results.
