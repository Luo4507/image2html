# Ordered Quality and Performance Implementation Plan

**Goal:** Implement the previously prioritized improvements in dependency order while preserving current MCP and HTTP behavior.


**Status (2026-11-12):** Tasks 1-5 are implemented. Verification covers 33 unit/regression tests, TypeScript compilation, a real login-page conversion, MCP regression, HTTP SSE/preview, and artifact downloads. The real login conversion reached 99.01% overall similarity, but the stricter content/edge quality gate still requires further calibration or visual improvement.
**Architecture:** Establish measurable quality baselines and repair history first, then add optional segmented generation, patch-based repair, text coverage, and safe result caching. Existing direct generation remains the default for simple pages.

---

### Task 1: Quality baselines and repair history

- Create `quality/baseline.json`, `src/validator/quality-baseline.ts`, and tests.
- Extend `runAutoCorrection` with initial/candidate history and adoption decisions.
- Save quality history in HTTP artifacts and demo verification output.

### Task 2: Lightweight region planning and segmented generation

- Create a compact region-planning prompt that returns only major regions.
- Add optional `layoutMode: "segmented"` for complex HTML pages.
- Crop regions with Sharp, generate them concurrently, and assemble a valid document.
- Test plan parsing, assembly, and fallback behavior.

### Task 3: Patch-based visual repair

- Replace full-code repair with structured `oldText`/`newText` edits.
- Validate patch syntax, exact matches, and unrelated-code preservation.
- Fall back safely when a model patch cannot be applied.

### Task 4: Text coverage and asset support

- Add optional original-text extraction and generated-code coverage measurement.
- Add a quality gate for text coverage when enabled.
- Add reusable asset extraction helpers for model-identified regions.

### Task 5: Execution efficiency

- Add content-hash/options-based server conversion caching.
- Preserve real-time preview and per-user isolation.
- Run all tests, typecheck, build, and real demo verification.
