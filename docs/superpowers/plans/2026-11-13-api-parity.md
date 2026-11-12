# API Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the same generation and validation controls across public interfaces.

**Architecture:** All interfaces construct `CodegenOptions` and pass them to the existing conversion pipeline. Validation thresholds are scoped overrides on `DesignToCode.validate()`; framework validation reuses the shared Vite runtime.

**Tech Stack:** TypeScript, Zod, MCP SDK, Express, Commander, Vitest.

---

- [ ] Add failing MCP option-mapping and threshold tests.
- [ ] Implement MCP schema/handler mapping and scoped validation overrides.
- [ ] Add failing HTTP option and invalid-combination tests.
- [ ] Implement HTTP fields, early option validation and 400 errors.
- [ ] Add CLI flags, update documentation, and run full regression/build.
