---
description: Implement fix from RCA document for GitHub issue
argument-hint: [github-issue-id]
---

# Implement Fix: GitHub Issue #$ARGUMENTS

## Prerequisites
- RCA exists at `docs/rca/issue-$ARGUMENTS.md`
- Follow repo conventions in `.agent/rules/00-core.md`

## Steps

### 1) Read RCA + issue
- Read: `docs/rca/issue-$ARGUMENTS.md`
- Optional (preferred): propose `gh issue view $ARGUMENTS`

### 2) Plan the minimal fix
- Identify the smallest safe change that resolves the root cause
- Define regression test(s)

### 3) Implement + test
- Apply fix with minimal diff
- Add/update tests per repo stack
- Run `.agent/workflows/validate-simple.md` (and comprehensive validate if needed)

### 4) Commit + PR readiness
- Commit message references `(#$ARGUMENTS)`
- Ensure PR body later can include `Fixes #$ARGUMENTS` if appropriate

## Output
- Summary of fix
- Tests run + results
- Follow-up risks or issues
