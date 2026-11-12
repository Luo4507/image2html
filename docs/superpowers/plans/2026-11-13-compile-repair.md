# Compile Failure Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair invalid React/Vue source from real compiler diagnostics before visual comparison.

**Architecture:** A code-model repair prompt returns a complete corrected source file. Conversion wraps initial validation with a bounded compile/runtime repair loop, then continues with existing visual quality and repair stages.

**Tech Stack:** TypeScript, existing OpenAI-compatible code model, Vite, Playwright, Vitest.

---

- [ ] Add failing conversion tests for one successful repair, bounded persistent failure, and fast-mode bypass.
- [ ] Implement diagnostic prompt, public source repair API, bounded conversion loop and repair history.
- [ ] Add a script that repairs saved failed artifacts and performs real original-image validation.
- [ ] Run unit/integration regression, typecheck and production build.
- [ ] Repair the saved Juejing React and Vue failures, compare rendered output with the original, and report quality honestly.
