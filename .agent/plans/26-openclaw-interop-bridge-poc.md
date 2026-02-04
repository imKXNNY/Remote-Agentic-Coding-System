# Issue #26 - OpenClaw interop PoC: constrained webhook/event bridge

Issue: `#26`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Implement a low-risk interoperability PoC where OpenClaw can send one inbound bridge event that triggers one constrained read-only action with strict safety guardrails and auditable run tracking.

## Acceptance Criteria
- [ ] End-to-end PoC demo documented.
- [ ] Safety guards validated with at least one negative test scenario.
- [ ] Decision memo created: continue, adjust, or stop.

## Scope Contract (PoC)
- Trigger source: one inbound event class (`openclaw.bridge.command`).
- Action target: one constrained action (`/status` -> read-only status report).
- Observability: include `eventId`, `runId`, `chainId` in responses and persist run lifecycle via control-plane ledger.

## Safety Requirements Mapping
- Allowed repository/branch allowlist -> enforced via `evaluateWebhookPolicy(...)`.
- Idempotency key + replay protection -> `dedupeKey` + control-plane intake decisions.
- Max-iteration / cooldown guard -> existing control-plane guardrail path.
- Explicit command allowlist -> OpenClaw-specific allowlist (default only `/status`).

## Touch Points
- `src/routes/openclaw.ts` (new bridge route/handler)
- `src/routes/openclaw.test.ts` (new route tests including negative safety path)
- `src/index.ts` (mount OpenClaw webhook router)
- `src/db/webhook-control-plane.ts` (extend intake platform type to include `openclaw`)
- `docs/OpenClaw/analysis/` (PoC demo + decision memo)
- `docs/OpenClaw/README.md` (index updates)
- `.agent/reports/execution-reports/` (execution artifact)

## Execution Slices

### Slice 1 - Bridge ingress and safety envelope
1. Add OpenClaw bridge POST endpoint (`/webhooks/openclaw/bridge`).
2. Validate required payload fields and shared-secret header.
3. Enforce OpenClaw command allowlist (default `/status`).
4. Evaluate repository/branch guardrails through existing webhook policy evaluator.

### Slice 2 - Control-plane integration and observability
1. Extend intake platform type to support `openclaw`.
2. Build deterministic dedupe keys from `eventId` + context.
3. Reuse intake decisions for replay/paused/blocked/approval states.
4. Return and log `eventId`, `runId`, and `chainId`.

### Slice 3 - Constrained action implementation
1. Implement one read-only action for `/status`.
2. Action response includes loop-health snapshot from existing webhook metrics/runs queries.
3. Finalize accepted runs as `executed`; register failure signatures on processing errors.

### Slice 4 - Tests + docs + recommendation
1. Add route tests for:
   - happy path status command,
   - negative path for disallowed command (explicit safety validation),
   - replay/dedupe behavior signaling.
2. Add PoC demo documentation (request/response example).
3. Add decision memo (continue/adjust/stop).

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#26`
- **Branch:** `feature/26-openclaw-interop-bridge-poc`
- **Plan file path:** `.agent/plans/26-openclaw-interop-bridge-poc.md`
