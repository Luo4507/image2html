# API Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Expose the same generation and validation controls across public interfaces.

**Architecture:** All interfaces construct `CodegenOptions` and pass them to the existing conversion pipeline. Validation thresholds are scoped overrides on `DesignToCode.validate()`; framework validation reuses the shared Vite runtime.

**Tech Stack:** TypeScript, Zod, MCP SDK, Express, Commander, Vitest.

**Status (2026-11-13):** Completed. 25 test files / 70 tests pass; typecheck and production build pass; real MCP validation and CLI option help verified.

---

- [x] Add failing MCP option-mapping and threshold tests.
- [x] Implement MCP schema/handler mapping and scoped validation overrides.
- [x] Add failing HTTP option and invalid-combination tests.
- [x] Implement HTTP fields, early option validation and 400 errors.
- [x] Add CLI flags, update documentation, and run full regression/build.
