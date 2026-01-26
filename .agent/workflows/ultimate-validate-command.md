---
description: Generate a repo-specific comprehensive validation workflow
---

# Generate Ultimate Validate Workflow

## Goal
Create a **repo-specific** validation workflow that reflects real usage and integrations.

## Output
Create a new workflow file:
- `.agent/workflows/validate-ultimate.md`

(Do not overwrite existing validate workflows unless explicitly requested.)

## Process

### 1) Discover real workflows
Read:
- README “Usage/Quickstart/Examples”
- docs/ guides
- CI workflows (`.github/workflows/*`)

Extract:
- What users actually do
- Required services (DB, queues, webhooks, containers)
- External integrations (GitHub, Telegram, Slack, payments, etc.)

### 2) Discover tooling
Identify:
- Lint/format tools
- Type checking
- Test frameworks (unit/integration/e2e)
- Build/package steps
- Any migration steps (db schema, generated clients)

### 3) Define a robust validate procedure
The new `validate-ultimate.md` should:
- Propose setup commands (docker compose, db, tunnels) only if needed
- Propose validation commands grouped by category
- Include teardown steps
- Explain expected success signals
- Avoid printing secrets

### 4) Add a short report section
Include a final summary template (pass/fail per stage).
