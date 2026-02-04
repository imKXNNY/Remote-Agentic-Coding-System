# Issue #39 - Autonomous loop v2 runner: bounded remediation state machine

Issue: `#39`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Implement a deterministic autonomous remediation runner on top of existing webhook control-plane primitives, with bounded retries, cooldown behavior, and explicit terminal reasons.

## Acceptance Criteria
- [ ] No unbounded retry paths; hard max attempts per chain.
- [ ] Replayed/duplicate events remain idempotent.
- [ ] Terminal reasons are structured and queryable.
- [ ] Integration tests cover success, retry, cooldown, and abort paths.

## Current Baseline
- Control-plane persistence and intake decisions exist (`accepted`, `deduped`, `replay_inflight`, `paused`, `requires_approval`, `blocked`).
- Policy and approval gates exist.
- Run events and metrics exist.
- Missing: first-class autonomous retry state machine with explicit backoff/cooldown and terminal reason taxonomy.

## Touch Points
- `src/adapters/github.ts`
- `src/db/webhook-control-plane.ts`
- `src/utils/webhook-control-plane.ts`
- `src/routes/github.ts` (if response metadata expansion is needed)
- `src/adapters/github.test.ts`
- `src/routes/github.test.ts`
- `docs/automation/webhook-autonomous-loop-design.md`
- `.agent/reports/execution-reports/*`

## Execution Slices

### Slice 1 - State machine contract + reason enums
1. Add explicit run/chain reason enums for autonomous lifecycle outcomes (retry_scheduled, retry_exhausted, cooldown_active, aborted_guardrail, succeeded, approval_required).
2. Ensure finalization paths write structured reason codes (not only free-form strings).
3. Keep backward compatibility by preserving existing statuses while extending reason semantics.

### Slice 2 - Bounded retry policy
1. Add deterministic retry policy function using risk tier + failure signature + attempt count.
2. Enforce hard max attempts per chain and per run category.
3. On retry exhaustion, finalize with a terminal non-retry reason and pause/abort semantics.

### Slice 3 - Cooldown and backpressure integration
1. Add jittered cooldown windows on retry scheduling (bounded min/max).
2. Respect existing chain cooldown checks and record reason `cooldown_active` when blocked.
3. Add lightweight backpressure gate (queue/load threshold config) with deterministic response and reason code.

### Slice 4 - Adapter orchestration integration
1. Wire state machine decisions into `GitHubAdapter.processWebhook` failure path.
2. Ensure replay/in-flight idempotency behavior stays deterministic.
3. Emit lifecycle events for schedule-retry / retry-skipped / retry-exhausted.

### Slice 5 - Tests + docs
1. Add/extend tests for:
   - success path
   - retry scheduled path
   - cooldown active path
   - retry exhausted/abort path
   - dedupe/replay invariants unchanged
2. Update automation design docs with implemented state machine details and tunables.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#39`
- **Branch:** `feature/39-autonomous-loop-v2-runner`
- **Plan file path:** `.agent/plans/39-autonomous-loop-v2-runner.md`
