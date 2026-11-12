# Quality Metrics and Faster Validation Plan

**Goal:** Make visual validation more representative of real content quality and reduce its processing time.

**Architecture:** Compute one difference mask per image pair, derive content and edge metrics from the same pixel pass, and aggregate regions from the mask instead of repeatedly cropping images. Render the primary comparison at the source image dimensions.

---

### Task 1: Content-aware quality metrics

**Files:** `src/validator/quality-metrics.ts`, `test/quality-metrics.test.ts`, `src/types.ts`

- [x] Add tests for identical images and missing foreground content.
- [x] Calculate overall, content, edge, content ratio, and combined visual quality scores.
- [x] Expose the metrics in validation results.

### Task 2: Faster region analysis

**Files:** `src/validator/region-diff.ts`, `test/region-diff.test.ts`, `src/validator/visual-validator.ts`

- [x] Test that changed pixels are mapped to the correct semantic region.
- [x] Replace repeated Sharp crops with one mask aggregation.

### Task 3: Correct source viewport

**Files:** `src/validator/visual-validator.ts`

- [x] Read source image dimensions before rendering.
- [x] Use those dimensions for the primary comparison while keeping optional responsive screenshots.

### Task 4: Verification

- [x] Run all tests, typecheck, and build.
- [x] Run a real direct conversion and compare validation time and quality metrics with the previous stage.
