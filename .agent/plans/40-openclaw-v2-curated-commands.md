# Issue #40 - OpenClaw v2 Curated Commands + Capability Policy

Issue: `#40`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Evolve OpenClaw bridge from PoC into a curated, capability-aware command surface with deterministic blocked/unsupported outcomes.

## Acceptance Criteria
- [ ] New commands are explicitly allowlisted and capability-classified.
- [ ] Policy engine gates commands by capability/risk tier.
- [ ] Tests cover allowed/blocked/unknown command paths.
- [ ] Docs updated in `docs/OpenClaw/analysis/`.

## Execution Contract
- **Issue:** `#40`
- **Branch:** `feature/40-openclaw-v2-curated-commands`
- **Plan file path:** `.agent/plans/40-openclaw-v2-curated-commands.md`

## Touch Points
- `src/routes/openclaw.ts`
- `src/routes/openclaw.test.ts`
- `docs/OpenClaw/analysis/` (new v2 analysis doc)
- `.agent/reports/execution-reports/` (execution report)

## Slices

### Slice 1 - Curated command registry + capability map
1. Introduce explicit command registry with command token + capability (`read_only`, `needs_approval`, `mutating`).
2. Filter registry via `OPENCLAW_BRIDGE_ALLOWED_COMMANDS` to produce effective allowlist.
3. Add 2-3 additional read-only commands for OpenClaw bridge.

### Slice 2 - Capability-aware policy and deterministic outcomes
1. Evaluate policy with `isMutating` derived from command capability.
2. Ensure blocked commands produce deterministic `blocked_policy` response payload.
3. Ensure unsupported command implementations produce deterministic `unsupported_command` response payload.

### Slice 3 - Tests + docs + validation
1. Extend route tests to cover:
   - new read-only commands
   - unknown/disallowed command blocking
   - capability-mutating path behavior
   - deterministic unsupported response
2. Add/update docs under `docs/OpenClaw/analysis/`.
3. Run typecheck/lint/tests and write execution report.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/routes/openclaw.test.ts`
- `npm test`
