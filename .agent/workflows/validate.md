---
description: Run comprehensive validation (repo-aware, may include E2E/integration)
argument-hint: [optional-context]
---

# Validate (Comprehensive)

## Goal
Run the **full** validation required for production readiness, based on this repo’s workflows and integrations.

## Inputs
Optional context in `$ARGUMENTS`:
- environment name (dev/staging)
- base URL for E2E tests
- webhook tunnel URL (only if the repo truly needs it)

## Step 0) Determine what “comprehensive” means here
Read (when present):
- `.agent/rules/00-core.md` for DoD/testing policy
- CI workflows under `.github/workflows/*`
- docs that describe real user workflows

Then decide:
- Unit tests only? (small libraries)
- Integration tests? (DB, queues, external APIs)
- E2E/UI tests? (Playwright/Cypress)
- Build & packaging checks?

## Step 1) Propose the full command set (do not auto-run)
Group by category:
1) Lint/format
2) Type-check
3) Unit tests
4) Integration/E2E tests (incl. setup/teardown)
5) Build/package

Only propose commands that exist in the repo.

## Step 2) Environment/setup (only if needed)
If tests require services (DB, Docker, webhooks):
- Propose setup steps clearly (what, why, how to tear down)
- Avoid touching secrets; never print `.env` contents

## Step 3) Execute (after approval) + report
Provide a structured report:
- Commands run
- Pass/fail
- Links/paths to artifacts (screenshots, logs) if generated

## Step 4) Outcome
- If green: declare validation complete + next step (PR/merge)
- If red: list failures in priority order + suggested fixes
