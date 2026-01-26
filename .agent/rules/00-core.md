---
trigger: always_on
glob: **/*
description: Core rules for the remote agentic coding system.
---

# .agent/rules/00-core.md — Repo Core Rules (Source of Truth)

## 0) Source of Truth & Paths
- Rules: .agent/rules/*
- Workflows/Commands: .agent/workflows/*
- Plans: .agent/plans/
- Reports: .agent/reports/
If CLAUDE.md or GEMINI.md exist, they must point here (this file stays canonical).

## 1) Issue-First Process
- Each change must reference an Issue ID (e.g. #123).
- If the task exists only in chat: create an Issue Draft first (Title, Body, AC, Labels).
- “Discovered during work” items become NEW issues (or comment suggestions), not local log dumps.
- Legacy TASK.md / TODO.md:
  - Do not append.
  - If you need info from them: summarize into Issues and stop using them as a live tracker.

## 2) Definition of Done (DoD)
A task is “done” when:
- Acceptance Criteria of the Issue are met.
- Relevant tests exist/updated (unit/integration/E2E depending on change).
- Verification steps are provided (commands + expected outcome).
- README/docs updated if behavior/setup changed.
- No secrets added; configs follow repo conventions.

## 3) Branch / Commit / PR Conventions
- Branch naming:
  - feature/<issue>-short-slug
  - fix/<issue>-short-slug
  - chore/<issue>-short-slug (if applicable)
- Commit messages:
  - Prefer: "<type>: <summary> (#<issue>)"
  - For bugfixes that should auto-close on merge: ensure PR body contains "Fixes #<issue>".
- PR requirements:
  - PR title references Issue: "[#123] Short summary"
  - PR body includes:
    - What/Why
    - How tested
    - "Fixes #123" (when closing)

## 4) Testing Policy (Repo-aware)
- Prefer the repo’s existing test stack (do not invent libraries).
- UI/end-to-end flows: Playwright if already present.
- Pure logic: unit tests are acceptable and often faster.
- Bugfixes: add a regression test when feasible.
- Store screenshots/artifacts under .agent/reports/ or the repo’s established test artifact path.

## 5) Style & Tooling
- Follow the repo’s formatters/linters (ESLint/Prettier, Black/Ruff, etc.).
- Confirm file paths/modules exist before referencing them.
- Do not delete/overwrite code unless:
  - explicitly requested, OR
  - required by the Issue, OR
  - part of a minimal refactor necessary to implement the change safely.

## 6) Execution Rules (Terminal)
- Never run commands without explicit approval.
- When proposing commands, include:
  - the exact command
  - why it’s needed
  - what success looks like
