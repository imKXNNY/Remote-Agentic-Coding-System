# Issue #31 - Webhook Policy Engine and Approval Gates

Issue: `#31`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Implement policy evaluation and approval gating for webhook-triggered automation so autonomous actions remain safe, auditable, and explicitly controlled.

## Acceptance Criteria
- [ ] High-risk operations require explicit human approval.
- [ ] Protected path writes are blocked without override.
- [ ] Policy outcomes are explicit and auditable.

## Touch Points
- `src/utils/webhook-policy.ts` (new policy model + evaluator)
- `src/db/webhook-control-plane.ts` (persist policy/risk decisions and approval transitions)
- `migrations/010_webhook_policy_gates.sql` (add policy/risk/approval columns)
- `src/db/schema.ts` (runtime compatibility for new columns)
- `src/adapters/github.ts` (evaluate policy during intake, add approve-run handling)
- `src/adapters/github.test.ts` (policy + approval regression tests)
- `src/utils/webhook-policy.test.ts` (new evaluator tests)
- `src/routes/github.ts` + `src/routes/github.test.ts` (optional run filtering for audit visibility)

## Execution Slices

### Slice 1 - Policy model and evaluator
1. Add a dedicated webhook policy utility module with:
   - repository allowlist resolver
   - branch allowlist matcher
   - command allowlist matcher
   - protected path matcher
   - risk tier classifier (`low`/`medium`/`high`)
2. Expose a single evaluation function returning deterministic decision:
   - `allow`
   - `requires_approval`
   - `blocked`
3. Add unit tests for all decision branches and env-config defaults.

### Slice 2 - Persistence and approval state transitions
1. Add migration and schema compatibility fields on automation runs:
   - `risk_tier`
   - `policy_decision`
   - `policy_reason`
   - `approved_by`
   - `approved_at`
2. Extend webhook DB intake API to persist policy/risk metadata and support `requires_approval` run status.
3. Add DB helper to approve a pending run by id (`requires_approval` -> `accepted`) with maintainer identity metadata.

### Slice 3 - Adapter integration and maintainer approval command
1. In webhook intake, evaluate policy before guardrail intake result is returned.
2. Map policy outcomes to deterministic webhook responses:
   - `blocked` -> non-processing response with reason
   - `requires_approval` -> non-processing response including run id
   - `allow` -> existing accepted flow
3. Implement `@remote-agent approve-run <run-id>` command:
   - verify actor has maintainer-level permissions
   - approve pending run in DB
   - return explicit response message

### Slice 4 - Auditable output and regression coverage
1. Include policy/risk/decision fields in webhook responses where applicable.
2. Extend tests:
   - high-risk mutation requires approval
   - protected path mention is blocked unless override token is present
   - maintainer approve-run succeeds, non-maintainer fails
3. Ensure existing dedupe/replay behavior remains unchanged.

## Data/API Notes
- Keep policy defaults conservative but configurable via environment variables.
- Preserve existing webhook endpoint contract while adding explicit `policyDecision`, `riskTier`, and `reason` fields.

## Edge Cases
- Missing sender login for approval commands (deny approval)
- Invalid run id on approval command
- Approval command for non-`requires_approval` run
- Unknown/unsupported command text should not escalate risk by default

## Rollback Considerations
- Migration is additive only.
- Policy evaluation failures should fail closed for mutating commands and fail open for non-mutating comments where safe.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#31`
- **Branch:** `feature/31-webhook-policy-engine-and-approval-gates`
- **Plan file path:** `.agent/plans/31-webhook-policy-engine-and-approval-gates.md`
