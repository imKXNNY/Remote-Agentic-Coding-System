---
description: Analyze and document root cause for a GitHub issue
argument-hint: [github-issue-id]
---

# Root Cause Analysis: GitHub Issue #$ARGUMENTS

## Objective
Investigate issue #$ARGUMENTS, identify root cause(s), and document findings for implementation.

## Read first
- `.agent/rules/00-core.md` (repo conventions, testing policy)

## Steps

### 1) Fetch Issue context (preferred)
Propose:
- `gh issue view $ARGUMENTS`

Capture:
- Expected vs actual
- Repro steps
- Environment details
- Links/logs

### 2) Reproduce (if feasible)
Describe a minimal repro procedure.
If it requires commands/services, propose them clearly and wait for approval.

### 3) Locate root cause
- Identify affected modules/files
- Trace the failure path
- Validate assumptions against the code

### 4) Document RCA
Write to: `docs/rca/issue-$ARGUMENTS.md`

Include:
- Summary
- Symptoms
- Root cause
- Contributing factors
- Fix strategy (high level)
- Tests needed to prevent regression
- Risks

## Output
- Path to RCA document
- Suggested next workflow: `implement-fix $ARGUMENTS`
