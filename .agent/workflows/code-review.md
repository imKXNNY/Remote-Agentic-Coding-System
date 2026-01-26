---
description: Technical code review for quality, correctness, and maintainability
---

# Code Review

## Goal
Review recent changes for correctness, clarity, and alignment with repo conventions.

## Read first
- `.agent/rules/00-core.md`
- Any repo lint/style/testing conventions (README, docs)

## Gather diffs (propose commands)
- `git status`
- `git diff HEAD`
- `git diff --stat`

## Review checklist

### Correctness & Safety
- Edge cases handled, inputs validated
- Error handling around IO/network/db
- No secrets logged or committed

### Architecture & Maintainability
- Follows existing patterns and folder conventions
- Small cohesive functions/modules
- Avoids unnecessary abstraction

### Performance
- Avoids obvious N+1 / expensive loops / repeated API calls
- Reasonable caching/batching when relevant

### UX / API contracts
- No breaking changes without migration path
- Clear user-facing behavior

### Tests
- Behavior changes covered by appropriate tests
- Bugfixes have regression tests when feasible

## Output
Provide:
1) Summary
2) Findings grouped by severity:
   - Blocker
   - High
   - Medium
   - Low / nit
3) Suggested fixes (specific)
Optionally save a report to:
- `.agent/reports/code-reviews/<date>-<topic>.md`
