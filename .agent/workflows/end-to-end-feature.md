---
description: Autonomously develop a complete feature from planning to PR-ready
argument-hint: [issue-id or feature-description]
---

# End-to-End Feature Development: $ARGUMENTS

This workflow chains the core workflows in canonical paths.

## 1) Prime
Run: `.agent/workflows/prime.md`

## 2) Plan
Run: `.agent/workflows/plan-feature.md` with arguments: `$ARGUMENTS`

Expected outputs from planning:
- Issue ID (or Issue Draft)
- Branch name
- Plan file at `.agent/plans/<id>-<slug>.md`

## 3) Execute
Run: `.agent/workflows/execute.md` with:
- `<branch>` and `<plan-file-path>`

## 4) Review + Validate
Run:
- `.agent/workflows/code-review.md`
- `.agent/workflows/validate-simple.md` (or `.agent/workflows/validate.md` if required by the repo)

## 5) Commit / PR
If not already done:
- `.agent/workflows/commit.md`
- `.agent/workflows/create-pr.md` (base branch optional)

## Output
Provide a final recap:
- Issue link/id
- PR-ready status (yes/no)
- How to verify
- Any remaining risks
