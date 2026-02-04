---
description: Execute a development plan (Issue-first, test-aware)
argument-hint: [branch] [plan-file-path]
---

# Execute Development Plan

## Inputs
`$ARGUMENTS` should contain:
- `<branch>` (e.g. `feature/123-short-slug`)
- `<plan-file-path>` (e.g. `.agent/plans/123-short-slug.md`)

If only one value is provided, treat it as the plan path and derive a branch name from the plan (⚠️ assumption).

## Non-negotiables
- Do NOT create or maintain TASK.md/TODO.md log dumps.
- Track progress via GitHub Issue comments when possible; otherwise provide a concise progress log in your response.

## Step 1) Load context
1) Read `.agent/rules/00-core.md` (canonical).
2) Read the plan file.
3) Identify the Issue ID and Acceptance Criteria from the plan.

If the plan does not contain an Issue reference:
- Output an Issue Draft first, then continue.

## Step 2) Prepare branch
Run the exact commands below (do not just propose them).
Use the repo default branch from `.agent/rules/00-core.md` (this repo: `stable`) or derive it via
`git symbolic-ref refs/remotes/origin/HEAD` so you never assume `main`.

Run the exact commands to:
- confirm status
- create/switch to the branch
- sync with base branch (as per repo rules)

## Step 3) Implement in slices
For each slice in the plan:
- Make the minimal code change
- Add/update tests for the behavior change
- Keep diffs localized
- Update documentation if needed

Maintain a small checklist in the response:
- [ ] Slice 1 …
- [ ] Slice 2 …
(Use Issue comments if available.)

Add a short checkpoint after each slice using this format:
- `Done:` what changed in this slice
- `Evidence:` tests/checks or concrete signal for this slice
- `Next:` exact next slice action

## Step 4) Verification
Run the repo-appropriate validation commands (prefer existing scripts) and record results:
- lint / format check
- type-check
- tests (unit/integration/e2e as needed)
- build

Record results (pass/fail + highlights).

## Step 5) Commit
- Ensure commits reference the Issue.
- Prefer atomic commits per logical slice.
- If this branch will close an issue on merge, ensure PR body later includes `Fixes #<id>`.

## Step 6) Output
Return:
- Summary of changes
- Files touched
- Verification results + commands to reproduce
- Follow-ups / new issues discovered (as Issue Drafts)
