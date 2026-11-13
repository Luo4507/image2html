# Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve real visual consistency through accurate comparison, actionable diagnostics, region-aware repair and framework-neutral long-page generation.

**Architecture:** Extend the existing validator with dimension and layout metadata, focus visual repair on the worst region with a validated full-code fallback, and generalize the segmented generator to React/Vue without changing the shared Vite runtime.

**Tech Stack:** TypeScript, Sharp, Pixelmatch, Playwright, Vite, Vitest.

---

### Task 1: Distortion-free comparison

- [ ] Add failing pixel tests for shorter/taller generated screenshots and dimension metadata.
- [ ] Implement crop/pad normalization without stretching and expose dimensions in validation results.

### Task 2: Layout diagnostics

- [ ] Add failing browser tests for element bounds and computed styles.
- [ ] Capture a bounded layout snapshot and include it in visual repair prompts.

### Task 3: Region-aware repair and safe fallback

- [ ] Add failing tests for worst-region crop selection, patch failure fallback, model-call accounting and score-based rejection.
- [ ] Implement repair-image cropping, focused prompts and full-code visual fallback.

### Task 4: Segmented React/Vue generation

- [ ] Add failing assembly and runtime tests for multi-region React and Vue output.
- [ ] Implement framework-specific region prompts and assembly; remove the old HTML-only guard.

### Task 5: Regression and real-image verification

- [ ] Run all tests, typecheck and production build after each stage.
- [ ] Backtest Juejing and Dianya across frameworks and exercise segmented long-page generation.
- [ ] Update documentation with actual build, visual gate and repair results.
