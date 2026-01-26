---
description: Prepare and open a high-quality Pull Request
argument-hint: [base-branch]
---

# Create Pull Request

Use after the branch is complete and validated.

## 1) Pre-flight
Read `.agent/rules/00-core.md` for PR conventions and DoD.

## 2) Sync with base branch (propose commands)
- Confirm branch: `git status -sb`
- Fetch: `git fetch origin`
- Rebase (preferred): `git rebase origin/<base>`
  - Base defaults to `main` unless `$ARGUMENTS` provided
- Push (if rebased): use `--force-with-lease`

## 3) Validation
- Run `.agent/workflows/validate-simple.md` at minimum
- Use `.agent/workflows/validate.md` if repo DoD requires it

## 4) Open PR (GitHub CLI preferred)
Propose:
- `gh pr create`

PR requirements:
- Title: `[#<issue>] <summary>`
- Body includes:
  - What/Why
  - How tested
  - Risks
  - `Fixes #<issue>` (only if it should close on merge)

## Output
- PR link (or PR draft content if `gh` not available)
