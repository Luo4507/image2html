# Job Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore job state, interrupted work and successful conversion cache after a server restart.

**Architecture:** Job directories persist input and full conversion results beside existing artifacts. `JobService.restore()` loads history into `JobQueue`, requeues unfinished jobs, and rebuilds cache entries using the existing hash function.

**Tech Stack:** TypeScript, Node fs, Express, Vitest.

**Status (2026-11-13):** Completed. 26 test files / 72 tests pass; typecheck and production build pass; real HTTP job, SSE, preview and artifact verification succeeded.

---

- [x] Add failing restart tests for completed job lookup and artifact recovery.
- [x] Add failing running/queued requeue tests and cache-without-model tests.
- [x] Implement queue restore, persisted inputs/results, service restore and server startup waiting.
- [x] Run focused recovery tests, full regression, typecheck, build and HTTP verification.
- [x] Update deployment documentation and record single-process recovery limitations.
