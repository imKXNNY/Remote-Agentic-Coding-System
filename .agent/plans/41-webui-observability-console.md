# Issue #41 - WebUI observability console for automation runs

Issue: `#41`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Expose automation observability directly in WebUI with filtering and run drill-down, while keeping displayed data safely redacted.

## Acceptance Criteria
- [x] WebUI can list runs and open event timeline details.
- [x] Metrics and counts match backend APIs.
- [x] No secret/token/raw payload leakage in UI.
- [x] Responsive layout consistent with existing WebUI updates.

## Execution Contract
- **Issue:** `#41`
- **Branch:** `feature/41-webui-observability-console`
- **Plan file path:** `.agent/plans/41-webui-observability-console.md`

## Prime Summary
- Existing backend APIs already expose runs, events, and metrics (`/api/github/webhook-runs`, `/api/github/webhook-runs/:runId/events`, `/api/github/webhook-metrics`) but runs endpoint only supports `limit` and events are not redacted.
- WebUI has telemetry panel (`StatsPanel`) but no automation-run console, no filtering, and no run-event drill-down.
- Chat controls area (`Chat.svelte`) is the best insertion point for an operator-facing observability pane.

## Touch Points
- `src/db/webhook-control-plane.ts`
- `src/routes/github.ts`
- `src/routes/github.test.ts`
- `webui/src/lib/api.ts`
- `webui/src/components/AutomationConsole.svelte` (new)
- `webui/src/components/Chat.svelte`

## Slices

### Slice 1 - Backend filtering + safe redaction
1. Extend runs query to support filters: platform, status, time window, run/chain ID and text search.
2. Update `/api/github/webhook-runs` to parse and pass filters.
3. Redact sensitive fields in run event payloads in `/api/github/webhook-runs/:runId/events`.
4. Add/adjust route tests for filter forwarding and redaction behavior.

### Slice 2 - WebUI automation console
1. Add `AutomationConsole.svelte` with:
   - run ledger table
   - status distribution summary
   - event timeline drill-down for selected run
2. Add filters in UI: platform, status, time window, run/chain ID search.
3. Integrate panel into chat controls and keep layout responsive.
4. Keep rendering minimal and safe (no raw payload dumps, show redacted metadata only).

### Slice 3 - Validate + report
1. Run targeted tests + typecheck + lint.
2. Add execution report under `.agent/reports/execution-reports/`.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/routes/github.test.ts`
- `npm test`
