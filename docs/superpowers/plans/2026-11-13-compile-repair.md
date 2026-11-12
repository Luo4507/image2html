# Compile Failure Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Repair invalid React/Vue source from real compiler diagnostics before visual comparison.

**Architecture:** A code-model repair prompt returns a complete corrected source file. Conversion wraps initial validation with a bounded compile/runtime repair loop, then continues with existing visual quality and repair stages.

**Tech Stack:** TypeScript, existing OpenAI-compatible code model, Vite, Playwright, Vitest.

**Status (2026-11-13):** Completed. 27 test files / 75 tests pass. Real saved Juejing failures were repaired and original-image validated: React 72.92% similarity, Vue 90.80%; both remain below the strict quality gate.

---

- [x] Add failing conversion tests for one successful repair, bounded persistent failure, and fast-mode bypass.
- [x] Implement diagnostic prompt, public source repair API, bounded conversion loop and repair history.
- [x] Add a script that repairs saved failed artifacts and performs real original-image validation.
- [x] Run unit/integration regression, typecheck and production build.
- [x] Repair the saved Juejing React and Vue failures, compare rendered output with the original, and report quality honestly.
