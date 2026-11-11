# Multi-user Server Implementation Plan

> **For agentic workers:** Implement in order, preserving the existing CLI and stdio MCP interfaces.

**Goal:** Package image2html as a multi-user HTTP service suitable for deployment on a company server.

**Architecture:** An Express API accepts authenticated image uploads and creates asynchronous conversion jobs. A bounded in-memory queue limits model and browser concurrency; each user can access only their own jobs and artifacts. Docker provides a reproducible runtime with Chromium and persistent job storage.

**Tech Stack:** Node.js 20, TypeScript, Express, Multer, Vitest, Playwright, Docker.

---

### Task 1: Job and identity primitives

**Files:**
- Create `src/server/config.ts`
- Create `src/server/job-queue.ts`
- Create `src/server/job-service.ts`
- Create `test/job-queue.test.ts`

- [ ] Test that queue concurrency never exceeds its configured limit.
- [ ] Test that failed jobs expose a safe error and release their worker slot.
- [ ] Implement API-key identity parsing, bounded execution, job ownership, and disk-backed artifacts.

### Task 2: Authenticated HTTP API

**Files:**
- Create `src/server/app.ts`
- Create `src/server/index.ts`
- Create `test/server-app.test.ts`

- [ ] Test public health checks and rejection of missing/invalid API keys.
- [ ] Test job creation, status retrieval, ownership isolation, and artifact URLs with a fake converter.
- [ ] Implement upload validation, per-user/IP rate limits, safe path handling, and error responses.

### Task 3: Deployment packaging

**Files:**
- Create `Dockerfile`
- Create `.dockerignore`
- Create `docker-compose.yml`
- Create `docs/deployment.md`
- Modify `package.json`, `.env.example`, `.gitignore`, and `README.md`

- [ ] Add `serve`, `verify:server`, and server dependencies.
- [ ] Document API keys, concurrency, persistent storage, reverse proxy limits, and upgrade precautions.
- [ ] Build a production image containing Chromium without development dependencies.

### Task 4: Verification

- [ ] Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Start the server with test credentials and verify health, authentication, job creation, polling, and artifact download.
- [ ] Run the existing MCP verification to confirm no regression.
- [ ] Inspect Git status to ensure secrets and runtime data are excluded.
