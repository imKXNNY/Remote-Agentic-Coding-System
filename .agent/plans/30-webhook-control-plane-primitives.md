# Issue #30 - Webhook Control-Plane Primitives

Issue: `#30`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-03

## Goal
Implement durable webhook control-plane primitives that make autonomous loops safe and deterministic: idempotency/replay control, run/chain state tracking, iteration and cooldown guardrails, and deterministic terminal statuses.

## Acceptance Criteria
- [ ] Duplicate deliveries are safely deduped with deterministic responses.
- [ ] Loop budget/cool-down prevent runaway retries.
- [ ] Run/chain states are queryable for audit and debugging.

## Touch Points
- `src/index.ts` (webhook ingress response/status behavior)
- `src/adapters/github.ts` (event handling path integration)
- `src/db/*` (new run/chain persistence helpers)
- `src/types/index.ts` (control-plane status/type additions if needed)
- `src/utils/*` (idempotency key + guardrail helpers)
- `migrations/*` (schema for run/chain ledger)
- `src/adapters/github.test.ts` and/or new `src/control-plane/*.test.ts` (regression tests)
- `docs/automation/webhook-autonomous-loop-design.md` (implementation notes/status alignment if needed)

## Execution Slices

### Slice 1 - Persistence model and status contract
1. Add schema/migration for run/chain records with fields needed for:
   - `run_id`, `chain_id`, `dedupe_key`, `conversation_id`, `event_type`
   - lifecycle timestamps and terminal status
   - iteration counters and cooldown-until timestamp
2. Add DB access layer functions for create/find/update run and chain state.
3. Define deterministic statuses: `accepted`, `deduped`, `blocked_policy`, `requires_approval`, `executed`, `paused`.

### Slice 2 - Idempotency and replay handling
1. Implement dedupe key generator:
   - `<delivery_id>:<repo>:<object_type>:<object_number>:<action>:<head_sha?>`
2. At webhook ingress/adapter boundary:
   - detect duplicate delivery keys and short-circuit deterministically
   - return/record `deduped` for terminal duplicates
   - return/record in-flight replay marker when active run exists
3. Add TTL behavior for dedupe records (DB-side retention policy or app-side cleanup contract).

### Slice 3 - Loop guardrails (budget + cooldown + stop condition hook)
1. Enforce per-chain iteration budget and mutating-run rate limits.
2. Enforce cooldown window before new mutating runs.
3. Add stop-condition primitive for repeated failure signature without net diff (hook point for evaluator integration).
4. Transition chain/run status to `paused` when guardrails trigger.

### Slice 4 - Tests and observability surface
1. Add unit tests for:
   - dedupe key generation and replay behavior
   - iteration budget/cooldown enforcement
   - deterministic status transitions
2. Add integration-level tests on webhook handler path for duplicate delivery and paused-chain behavior.
3. Ensure query path exists for audit/debug visibility of run/chain state (DB helper + route/internal accessor).

## Data/API Notes
- Prefer minimal API changes in this issue; internal primitives first.
- If a read endpoint is needed for debugability, keep it scoped and authenticated.

## Edge Cases
- Missing delivery IDs (fallback key strategy)
- Out-of-order webhook deliveries
- Parallel deliveries for same conversation chain
- Restart recovery (in-flight runs and cooldown persistence)

## Rollback Considerations
- Keep migration additive and backward compatible.
- Gate new behavior behind conservative defaults if needed.
- Preserve existing webhook path behavior when control-plane storage is unavailable (fail closed for mutations).

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#30`
- **Branch:** `feature/30-webhook-control-plane-primitives`
- **Plan file path:** `.agent/plans/30-webhook-control-plane-primitives.md`
