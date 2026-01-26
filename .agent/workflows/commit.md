---
description: Create an atomic commit for current changes
---

# Commit

## Goal
Create a clean, atomic commit that references the relevant Issue.

## Steps (propose commands)
1) Inspect changes:
- `git status`
- `git diff HEAD`
- `git diff --stat`

2) Stage:
- Prefer `git add -A`
- Re-check: `git status --porcelain`

3) Commit message
- Prefer: `<type>: <summary> (#<issue>)`
  - type: feat | fix | docs | chore | refactor | test
- Keep summary imperative, <= 72 chars.

4) Commit (after approval)
- `git commit -m "<type>: <summary> (#<issue>)"`

## Output
- Final commit hash
- Short summary of what’s included
