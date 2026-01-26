---
description: Run fast, repo-appropriate validation (lint/type/test/build)
---

# Validate (Simple)

## Goal
Run a **fast** validation pass using the repo’s existing tooling. Do not invent scripts.

## Step 0) Discover available validation commands
Check for (read-only):
- `package.json` scripts (lint, test, type-check, build)
- `pyproject.toml` / `tox.ini` / `noxfile.py` (Python)
- Makefile targets
- CI workflow hints (e.g. `.github/workflows/*`)

## Step 1) Propose commands (do not auto-run)
Choose the best matching commands from the repo. Typical examples:

### Node/TS (examples — use only if present)
- `npm run lint`
- `npm run type-check` (or `tsc -p tsconfig.json --noEmit`)
- `npm test`
- `npm run build`

### Python (examples — use only if present)
- `ruff check .` / `flake8`
- `mypy .`
- `pytest -q`
- `python -m build` (if packaging)

## Step 2) Execute (after approval) + report
Report results:
- Lint: pass/fail + key errors
- Type-check: pass/fail
- Tests: pass/fail + counts
- Build: pass/fail

## Step 3) Summary
Provide a short summary + next recommended action (fix, deeper validate, PR).
