# Live Preview and Progress Streaming Plan

**Goal:** Let users see generation progress and code previews before model generation and visual validation finish.

**Architecture:** The model client exposes throttled full-code snapshots. The conversion pipeline emits stage events; the job service stores per-user event history and the latest preview. The HTTP API exposes authenticated SSE and preview endpoints.

---

### Task 1: Stream callbacks in the model client

**Files:** `src/llm/client.ts`, `test/client.test.ts`

- [x] Extend the streaming test to require chunk callbacks.
- [x] Add an `onChunk` option called with the latest full text.

### Task 2: Conversion progress events

**Files:** `src/types.ts`, `src/index.ts`, `src/prompts/direct-generation.ts`

- [x] Add typed progress events and an optional request callback.
- [x] Emit reading, generating, code snapshot, validating, repairing, completed, and failed events.
- [x] Throttle code snapshots to avoid excessive event traffic.

### Task 3: Job event storage and HTTP streaming

**Files:** `src/server/job-service.ts`, `src/server/app.ts`, `test/job-events.test.ts`

- [x] Test event history, subscription, and latest-preview storage with a fake converter.
- [x] Add `GET /v1/jobs/:id/events` SSE and `GET /v1/jobs/:id/preview`.
- [x] Preserve per-user authorization and clean up subscriptions on disconnect.

### Task 4: Real verification

**Files:** `scripts/verify-server.mjs`, README

- [x] Verify SSE progress and preview while running a real conversion.
- [x] Run all tests, typecheck, build, and MCP regression verification.
