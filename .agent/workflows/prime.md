---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective
Build a reliable mental model of the repository: architecture, constraints, conventions, and the current task context.

## Rules (read first)
1) Read `.agent/rules/00-core.md` if it exists (canonical repo rules).
2) If `CLAUDE.md` or `GEMINI.md` exist, treat them as pointers to `.agent/rules/00-core.md`.

## Process

### 1) Snapshot project structure
Propose (do not auto-run) one of:
- `git ls-files`
- `tree -L 3 -I 'node_modules|.git|dist|build|.next|.venv|__pycache__'` (if available)
- `ls -la` / `dir` (fallback)

### 2) Read the docs that shape decisions
Read, in this order when present:
- `README.md` (root) + any `/docs/*` entry docs
- `ARCHITECTURE.md` / `docs/architecture/*` / ADRs
- `package.json` / `pyproject.toml` / key config files
- `.agent/rules/*` (repo rules)
- Any API contracts / schema docs

### 3) Identify key entrypoints & integration points
Based on structure, locate and skim:
- Application entrypoints (e.g. `src/index.*`, `app/*`, `main.py`, `server/*`)
- Routing / controllers / handlers
- Data access layer (DB client, ORM, repositories)
- Auth / permissions
- External integrations (webhooks, 3rd party APIs)

### 4) Summarize the context (output)
Return a concise “Prime Summary”:
- Stack + tooling (tests, build, lint)
- Key folders / modules and their roles
- Existing patterns to follow
- Known constraints / hazards
- Suggested next workflow: `plan-feature` or `execute` (with rationale)
