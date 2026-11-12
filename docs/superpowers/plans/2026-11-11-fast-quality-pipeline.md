# Fast Generation and Quality Loop Implementation Plan

> **For agentic workers:** Preserve the existing structured pipeline as an optional expert path.

**Goal:** Reduce default model calls from two to one, add stage-level performance metrics, and automatically repair failed visual validation without unbounded regeneration.

**Architecture:** Qwen VL directly generates code from the image. Existing validation renders and compares the result; a bounded auto-correction helper applies vision-guided repairs and keeps the best-scoring version. The structured JSON pipeline remains available through `pipeline: "structured"`.

**Tech Stack:** TypeScript, OpenAI-compatible SSE, Playwright, Pixelmatch, Vitest.

---

### Task 1: Multimodal streaming generation

**Files:** `src/llm/client.ts`, `test/client.test.ts`, `src/prompts/direct-generation.ts`

- [x] Add a failing test proving image-plus-text messages can be streamed and assembled.
- [x] Refactor SSE handling into a shared method and add `generateWithImages`.
- [x] Add a direct code-generation prompt requiring real UI code, exact text, no JSON, and no screenshot-as-page shortcuts.

### Task 2: Bounded automatic correction

**Files:** `src/validator/auto-corrector.ts`, `test/auto-corrector.test.ts`

- [x] Test immediate pass, improvement-then-pass, and no-improvement stop behavior.
- [x] Implement a generic bounded correction loop with best-version preservation.

### Task 3: Integrate fast and structured pipelines

**Files:** `src/types.ts`, `src/index.ts`, `src/config.ts`

- [x] Add `pipeline`, `qualityMode`, optional structure, and conversion metrics.
- [x] Make direct generation the default; keep structured generation as an expert option.
- [x] Run visual validation and bounded repair using the original image and current rendering.

### Task 4: Preserve HTTP and MCP compatibility

**Files:** `src/server/job-service.ts`, `scripts/verify.mjs`, README

- [x] Make structure output optional in job artifacts and verification scripts.
- [x] Document fast/balanced/precision behavior and new metrics.

### Task 5: Verify

- [x] Run typecheck, all tests, and build.
- [x] Run the existing MCP verification.
- [x] Execute a real direct conversion and inspect generated code, metrics, similarity, and artifacts.
