# Issue #32 - Webhook Observability and Audit Trail

Issue: `#32`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Add durable observability for webhook automation loops with auditable lifecycle events, metrics, and lightweight query/report endpoints.

## Acceptance Criteria
- [ ] Every run has an auditable lifecycle record.
- [ ] Core loop-health metrics are queryable.
- [ ] Sensitive payload fields remain redacted.

## Touch Points
- `migrations/011_webhook_run_events.sql` (new audit/event table)
- `src/db/schema.ts` (runtime compatibility for run-event table)
- `src/db/webhook-control-plane.ts` (emit and query lifecycle events + metrics)
- `src/routes/github.ts` (metrics + run-events endpoints)
- `src/routes/github.test.ts` (route-level tests)
- `src/adapters/github.test.ts` (status transition coverage remains green)
- `.agent/reports/execution-reports/*` (execution artifact)

## Execution Slices

### Slice 1 - Run lifecycle event schema
1. Add table `remote_agent_automation_run_events` with:
   - `id`, `run_id`, `chain_id`, `event_type`, `status`, `message`, `metadata`, `created_at`
2. Index for timeline queries (`run_id, created_at`) and chain-level slicing.
3. Add runtime schema compatibility in `src/db/schema.ts`.

### Slice 2 - Emit structured lifecycle events
1. Emit event on run creation (`run_created`) when a run row is inserted.
2. Emit event on run finalization (`run_finalized`) with terminal status and reason.
3. Emit event on approval transitions (`run_approved`) and failure signature registration (`failure_registered`).
4. Ensure metadata is redacted/minimal (no raw webhook payloads, no tokens, no full comment bodies).

### Slice 3 - Query/report surfaces
1. Add DB query for run event timelines by run id.
2. Add DB query for loop-health metrics (status totals + key counters + duration stats).
3. Add API endpoints:
   - `GET /api/github/webhook-runs/:runId/events`
   - `GET /api/github/webhook-metrics`

### Slice 4 - Tests + validation
1. Route tests for metrics and event timeline endpoints.
2. Regression check for webhook run status transitions and existing behavior.
3. Full validation pass (type-check/lint/tests/webui-check/build).

## Data/API Notes
- `metadata` should remain structured but redacted (status/risk/policy, no sensitive payload text).
- Metrics endpoint should be lightweight and derived from existing run rows/events (no external metrics backend dependency).

## Edge Cases
- Unknown run id for timeline endpoint returns empty array.
- Runs without `finished_at` excluded from duration averages.
- Missing optional fields in metadata should not break consumers.

## Rollback Considerations
- Migration is additive only.
- Existing run processing remains functional if event insertion fails (best effort event logging where safe).

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#32`
- **Branch:** `feature/32-webhook-observability-and-audit-trail`
- **Plan file path:** `.agent/plans/32-webhook-observability-and-audit-trail.md`
