# Webhook Autonomous Loop Design (Issue #24)

Date: 2026-02-03
Status: Design complete

## Objective
Enable GitHub webhook events to trigger useful autonomous remediation loops while preventing runaway behavior, unsafe write operations, and unclear ownership.

## Current Context
- Existing webhook ingress: `POST /webhooks/github` in `src/index.ts`.
- Existing event handling: `GitHubAdapter.handleWebhook(...)` in `src/adapters/github.ts`.
- Existing conversation identity: `{owner}/{repo}#{number}`.

This design layers policy and control-plane behavior on top of existing message routing.

## Trigger Matrix (Event -> Action)

| Event | Conditions | Autonomous Action | Notes |
|---|---|---|---|
| `issues.opened` | repository + branch policy allowed; issue not labeled `no-auto` | Triage + optional draft plan comment | Default read-only unless issue label enables write mode |
| `issue_comment.created` | contains `@remote-agent`; actor not in bot denylist | Execute requested workflow for issue context | Primary trigger for explicit user intent |
| `pull_request.opened` | PR author not bot account; repo policy allows | Read-only review summary + checklist | No auto-push by default |
| `pull_request_review_comment.created` | contains `@remote-agent`; PR not locked | Targeted fix proposal or patch branch update | High-risk paths require approval gate |
| `check_run.completed` / `check_suite.completed` | failed checks + policy allowlist | Produce failure RCA + suggested fix plan | Optional auto-fix only for low-risk categories |

Excluded by default:
- Force-push events, branch deletion events, release/tag events, and cross-repo events.

## Loop Control Strategy

### 1) Dedupe + idempotency key
Use key: `<delivery_id>:<repo>:<object_type>:<object_number>:<action>:<head_sha?>`.
- Store processed keys with TTL (24h default).
- Reject duplicates early with `status=deduped`.

### 2) Iteration budget
For each `conversationId` and root event chain:
- `max_iterations_per_chain = 3`
- `max_mutating_runs_per_24h = 5`
- Exceeding limits transitions chain to `paused` and requests human intervention.

### 3) Cool-down window
After each mutating run (commit/push/PR update), enforce cooldown:
- default 10 minutes per conversation chain
- bypass only with explicit human command (`@remote-agent override-cooldown` by authorized maintainer).

### 4) Stop conditions
- Same failure signature repeats twice without net diff.
- No green-check progress after `N` attempts.
- Policy violation detected (protected path, branch mismatch, disallowed command).

## Safety Gates

### Policy inputs
- **Allowed repositories**: explicit allowlist only.
- **Allowed target branches**: `feature/*`, `fix/*`, optional `chore/*`; deny direct writes to `stable`/`main`.
- **Command allowlist**: only vetted workflow commands (`prime`, `plan-feature`, `execute`, `code-review`, `validate-simple`, `execution-report`).
- **Protected-path policy**: block automation writes for secrets/config critical paths (for example `.env`, credentials, deploy keys, infra secrets).

### Risk tiers
- **Low risk**: docs changes, test-only changes, report generation.
- **Medium risk**: application code changes without schema/env changes.
- **High risk**: auth, security, CI/release, migrations, dependency upgrades, branch/repo settings.

Default autonomy:
- Low risk: fully autonomous allowed when policy gates pass.
- Medium risk: autonomous allowed only with explicit issue/PR mention trigger and green preflight.
- High risk: requires human approval before mutation.

## Human Override and Escalation

### Required human approval
- Any high-risk mutation.
- Any run exceeding iteration budget.
- Any run touching protected paths.
- Any non-fast-forward push or rebase requirement.

### Control commands (issue/PR comments by maintainers)
- `@remote-agent approve-run <run-id>`
- `@remote-agent pause-loop <chain-id>`
- `@remote-agent resume-loop <chain-id>`
- `@remote-agent disable-auto <repo|issue|pr>`

## Observability and Traceability

For each run, persist:
- `run_id`, `chain_id`, `trigger_event`, `policy_decision`, `risk_tier`, `decision_reason`.
- Links: issue/PR URL, commit SHAs, branch, validation results, artifacts.
- Timing: queued_at, started_at, finished_at, cooldown_until.

Audit log requirements:
- Append-only structured records.
- Secret-redacted payload metadata.
- Replay-safe status values: `accepted`, `deduped`, `blocked_policy`, `requires_approval`, `executed`, `paused`.

## Replay Handling
- Validate signature and delivery id before enqueue.
- If replay detected and prior run is terminal, return 200 with `deduped`.
- If replay detected while in-flight, return 202 with `already_processing`.

## Autonomous vs Approval Decision (Explicit)

### Fully autonomous allowed
- Read-only analysis/commenting workflows.
- Low-risk mutation workflows under allowlist + policy pass.
- Medium-risk mutation only when explicitly invoked via `@remote-agent` by authorized actor.

### Human approval required
- High-risk mutation workflows.
- Any protected-path writes.
- Retry/iteration budget overrides.
- Any policy exception or manual override.

## Metrics for Loop Health
- `automation_runs_total{status,risk_tier,event}`
- `automation_mutations_total{risk_tier}`
- `automation_deduped_total`
- `automation_requires_approval_total`
- `automation_pause_total{reason}`
- `automation_success_rate_7d`
- `automation_median_time_to_green`
- `automation_attempts_per_chain_p95`

Success SLO candidates:
- >= 90% low-risk autonomous runs complete without manual intervention.
- <= 1% runs end in policy-violation after acceptance.
- median time-to-first-action < 2 minutes.

## Phased Rollout Plan
1. **Phase 0 - Shadow Mode**
   - Ingest and classify events, no mutations.
   - Validate dedupe/risk decisions and audit log integrity.
2. **Phase 1 - Read-only Autonomy**
   - Enable triage, RCA comments, and review summaries.
3. **Phase 2 - Low-risk Mutation**
   - Enable doc/test/report updates on scoped branches.
4. **Phase 3 - Medium-risk with explicit trigger**
   - Require mention + policy pass + validation gates.
5. **Phase 4 - Controlled expansion**
   - Tune thresholds and broaden allowlists based on metrics.

## Follow-up Implementation Issues
- #30 - Implement webhook control-plane primitives (idempotency, chain state, iteration/cooldown guardrails).
- #31 - Implement policy engine + approval gates (repo/branch allowlist, command/path restrictions, risk tiers).
- #32 - Implement automation observability and audit trail (run ledger, metrics, replay-safe statuses, dashboards).

