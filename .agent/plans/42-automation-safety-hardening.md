# Issue #42 - Automation safety hardening: budget caps + circuit breaker + override flow

Issue: `#42`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Add production safety controls for autonomous webhook workflows: repository-scoped mutating budget caps, circuit breaker behavior, and auditable manual override flows.

## Acceptance Criteria
- [ ] Budget exhaustion blocks new mutating runs deterministically.
- [ ] Circuit breaker toggles pause mode with clear diagnostics.
- [ ] Overrides are fully auditable (who/when/why).
- [ ] Operational runbook published under `docs/automation/`.

## Prime Summary
- Stack/tooling: Node 20 + TypeScript, Jest, ESLint, Express, Postgres.
- Control-plane implementation already exists in `src/db/webhook-control-plane.ts` with intake decisions, retry, cooldown, backpressure, and run-events.
- GitHub webhook orchestration runs through `src/adapters/github.ts` (`ingestWebhook` + `processWebhook`).
- Existing operator command: `approve-run`; no full pause/resume/override command set yet.
- Existing observability routes: webhook runs/events/metrics in `src/routes/github.ts`.

## Touch Points
- `migrations/012_automation_safety_hardening.sql` (new)
- `src/db/schema.ts`
- `src/utils/webhook-control-plane.ts`
- `src/db/webhook-control-plane.ts`
- `src/adapters/github.ts`
- `src/adapters/github.test.ts`
- `src/utils/webhook-control-plane.test.ts`
- `docs/automation/operations-runbook.md` (new)
- `docs/automation/webhook-autonomous-loop-design.md`
- `.agent/reports/execution-reports/2026-02-04-42-automation-safety-hardening.md` (new)

## Execution Contract
- **Issue:** `#42`
- **Branch:** `feature/42-automation-safety-hardening`
- **Plan file path:** `.agent/plans/42-automation-safety-hardening.md`

## Execution Slices

### Slice 1 - Budget cap + circuit breaker primitives
1. [x] Add reason codes for budget/circuit-breaker outcomes.
2. Add DB primitives and migration:
   - [x] repository-scoped circuit-breaker state table
   - [x] override audit table (`actor`, `reason`, `action`, scope)
3. Extend intake flow:
   - [x] deterministic mutating-budget gate (repo scoped, windowed)
   - [x] circuit-breaker-open gate before accepting mutating run
4. [x] Extend failure registration to trip circuit breaker on threshold breach and persist diagnostics.

### Slice 2 - Override flows (auditable)
1. [x] Add DB functions for operator actions:
   - [x] pause/resume chain
   - [x] override cooldown
   - [x] override circuit breaker
2. [x] Persist all override actions to audit table with actor + reason + metadata.
3. [x] Extend GitHub command parsing for maintainers:
   - [x] `pause-loop <chain-id> <reason>`
   - [x] `resume-loop <chain-id> <reason>`
   - [x] `override-cooldown <chain-id> <reason>`
   - [x] `override-circuit-breaker <reason>` (repo scope)
4. [x] Return deterministic response payloads for each command path.

### Slice 3 - Tests + docs + verification
1. [x] Extend adapter tests for new control commands and response payloads.
2. [x] Extend utility tests for new reason codes / deterministic helpers as needed.
3. [x] Add runbook: pause/resume/unblock with exact command examples and expected outcomes.
4. [x] Update design doc to include new tunables and circuit breaker behavior.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/adapters/github.test.ts src/utils/webhook-control-plane.test.ts src/routes/github.test.ts`
- `npm run test`

## Risks & Mitigations
- Risk: false-positive breaker trips in noisy repos.
  - Mitigation: tunable thresholds + explicit operator override flow.
- Risk: command misuse by non-maintainers.
  - Mitigation: enforce maintainer permission checks before mutating control actions.
- Risk: operational ambiguity.
  - Mitigation: publish runbook with deterministic command/response matrix.
