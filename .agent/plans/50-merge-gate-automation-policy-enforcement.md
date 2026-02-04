# Issue #50 - Merge-gate automation and policy enforcement

Issue: `#50`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Introduce deterministic merge-gate evaluation for autonomous PR workflows, including explicit deny reasons, dry-run support, and maintainer-only audited override path.

## Acceptance Criteria
- [ ] Merge gate returns deterministic allow/deny decision with reasons.
- [ ] Auto-merge is blocked on failed/pending required checks.
- [ ] Override path requires explicit maintainer signal and is audited.
- [ ] Tests cover allow + deny + override scenarios.

## Execution Contract
- **Issue:** `#50`
- **Branch:** `feature/50-merge-gate-automation-policy-enforcement`
- **Plan file path:** `.agent/plans/50-merge-gate-automation-policy-enforcement.md`

## Touch Points
- `src/adapters/github.ts`
- `src/adapters/github.test.ts`
- `src/db/webhook-control-plane.ts`
- `src/utils/merge-gate.ts` (new)
- `src/utils/merge-gate.test.ts` (new)
- `docs/automation/operations-runbook.md`
- `docs/automation/webhook-autonomous-loop-design.md`
- `.env.example`

## Slices

### Slice 1 - Gate evaluator contract
1. Add `merge-gate` evaluator utility with deterministic `allow`/`deny` and explicit reason codes.
2. Evaluate required checks (configurable list), review blockers, and branch mergeability/up-to-date signal.
3. Expose dry-run-friendly payload (decision + reasons + diagnostics).

### Slice 2 - Adapter control commands
1. Add maintainer-only webhook commands:
   - `merge-gate <pr-number> [--dry-run]`
   - `auto-merge <pr-number> [--dry-run] [--override <reason>]`
2. Enforce gate block for merge when decision is deny and no override.
3. Merge when decision allow (or explicit override), and return deterministic response payloads.

### Slice 3 - Audited override + docs
1. Add DB helper to write repository override audit entries for merge-gate bypasses.
2. Record actor/reason/action/metadata when override is used.
3. Document merge-gate, dry-run, and override workflows in runbook/design docs.

### Slice 4 - Tests and verification
1. Add focused unit tests for gate evaluator utility.
2. Extend GitHub adapter tests for allow, deny, dry-run, and override merge flows.
3. Validate with type-check, lint, and targeted test commands.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/utils/merge-gate.test.ts src/adapters/github.test.ts`
- `npm run test`
