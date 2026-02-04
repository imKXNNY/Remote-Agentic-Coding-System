# Issue #49 - Full-auto dry-run E2E with guardrails

Issue: `#49`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Define and execute a repeatable dry-run protocol that validates the autonomous loop from trigger intake to merge-ready PR, while preserving manual merge control.

## Acceptance Criteria
- [ ] Dry-run executes from trigger to merge-ready PR without manual code edits outside defined intervention points.
- [ ] Guardrails/policy decisions are visible in run/event logs.
- [ ] Deterministic failure handling is verified for at least one synthetic invalid-input case.
- [ ] Report added under `.agent/reports/execution-reports/` with links to issue/PR/checks.

## Execution Contract
- **Issue:** `#49`
- **Branch:** `feature/49-full-auto-dry-run-e2e`
- **Plan file path:** `.agent/plans/49-full-auto-dry-run-e2e.md`

## Touch Points
- `docs/automation/README.md`
- `docs/automation/full-auto-dry-run-playbook.md` (new)
- `docs/automation/full-auto-dry-run-checklist.md` (new)
- `.agent/reports/execution-reports/2026-02-04-49-full-auto-dry-run-e2e.md`

## Slices

### Slice 1 - Protocol + guardrail checkpoints
1. Define phases: trigger -> intake -> policy -> execution -> PR -> review-iteration -> merge-ready.
2. Define intervention points where human action is allowed.
3. Define evidence artifacts per phase.

### Slice 2 - Deterministic failure probe
1. Add a synthetic invalid-input test step (missing required command args) as mandatory dry-run probe.
2. Capture expected status/error mapping and verification command output.

### Slice 3 - Execution report standardization
1. Create a concrete checklist to make runs repeatable.
2. Add/maintain execution report template and complete issue #49 report with real links.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/routes/openclaw.test.ts`
- `npm test`
