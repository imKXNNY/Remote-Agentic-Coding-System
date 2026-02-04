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
| `issues.opened` | repository + branch policy allowed; issue not labeled `no-auto` | Triage + optional draft plan comment | Default read-only; write mode only when issue is labeled `auto` (and not `no-auto`) |
| `issue_comment.created` | contains `@remote-agent`; actor not in bot denylist | Execute requested workflow for issue context | Primary trigger for explicit user intent |
| `pull_request.opened` | PR author not bot account; repo policy allows | Read-only review summary + checklist | No auto-push by default |
| `pull_request_review_comment.created` | contains `@remote-agent`; PR not locked | Targeted fix proposal or patch branch update | High-risk paths require approval gate |
| `check_run.completed` / `check_suite.completed` | failed checks + policy allowlist | Produce failure RCA + suggested fix plan | Auto-fix is limited to low-risk failure classes (docs/report/test-only and formatting/lint/type-fixable cases); unit/integration/security failures require approval |

Excluded by default:
- Force-push events, branch deletion events, release/tag events, and cross-repo events.

## Loop Control Strategy

### 1) Dedupe + idempotency key
Use key: `<delivery_id>:<repo>:<object_type>:<object_number>:<action>:<head_sha?>`.
- Optional field: `head_sha` (include only for PR/push/check events where a head SHA exists).
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
- bypass only with explicit human command (`@remote-agent override-cooldown <chain-id> <reason>` by authorized maintainer).

### 4) Stop conditions
- Same failure signature repeats twice without net diff.
- No green-check progress after `N` attempts.
- Policy violation detected (protected path, branch mismatch, disallowed command).

Failure signature definition:
- `failure_signature = hash(error_message + ":" + exit_code + ":" + sorted_failing_tests)`
- A repeated signature means this value is identical across consecutive attempts.

Net diff definition:
- A net diff exists when there is any meaningful change between attempts: commit SHA changes, file diffs, or test outcome differences.
- "Without net diff" means no commit/file changes and identical failing test set/outcome.

Example:
- Attempt 1 and Attempt 2 both produce `hash("pytest failed:42:test_a,test_b")`.
- No new commit and identical failing tests (`test_a`, `test_b`) in both attempts.
- Condition is met -> pause chain and require human intervention.

## Safety Gates

### Policy inputs
- **Allowed repositories**: explicit allowlist only.
- **Allowed target branches**: `feature/*`, `fix/*`, `chore/*` (configurable per-repo); deny direct writes to `stable`/`main`.
- **Command allowlist**: only vetted workflow commands (`prime`, `plan-feature`, `execute`, `code-review`, `validate-simple`, `execution-report`).
- **Protected-path policy**: block automation writes for secrets/config critical paths. Examples include `.env`, credential files, deploy keys, and infra secrets; each repository defines concrete protected path patterns in policy config.
- **Bot denylist**: maintained as policy configuration for known automation/bot accounts to prevent bot-to-bot loops.

### Risk tiers
- **Low risk**: docs changes, test-only changes, report generation.
- **Medium risk**: application code changes without schema/env changes.
- **High risk**: auth, security, CI/release, migrations, dependency upgrades, branch/repo settings.

Default autonomy:
- Low risk: fully autonomous allowed when policy gates pass.
- Medium risk: autonomous allowed only with explicit issue/PR mention trigger and green preflight.
- High risk: requires human approval before mutation.

Green preflight definition (for medium-risk autonomy):
- Explicit issue/PR mention trigger is present (for example `@remote-agent`).
- All mandatory policy gates pass (repo/branch/command/path/risk checks).
- Pre-mutation validation passes for required checks (at minimum lint + type-check + targeted tests).
- Required CI/security checks are green per policy profile.
- Policy may require all checks or a configured subset; the active policy profile must declare this explicitly.

## Human Override and Escalation

Authorized maintainer: a repository maintainer with write/admin permissions who is allowed by automation policy to execute override commands.

### Required human approval
- High-risk mutations.
- Runs exceeding iteration budget.
- Operations touching protected paths.
- Non-fast-forward pushes or rebase requirements.

### Control commands (issue/PR comments by maintainers)
- `@remote-agent approve-run <run-id>`
- `@remote-agent pause-loop <chain-id> <reason>`
- `@remote-agent resume-loop <chain-id> <reason>`
- `@remote-agent override-cooldown <chain-id> <reason>`
- `@remote-agent override-circuit-breaker <reason>` (repository scoped)
- `@remote-agent disable-auto <scope>` where scope is one of: `repo`, `issue`, `pr`
- Override actions are auditable and record `actor`, `reason`, `action`, and scope metadata.

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
- Medium-risk mutation only when explicitly invoked via `@remote-agent` by an authorized maintainer.

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
- #42 - Add safety hardening controls (repository budget caps, circuit breaker, auditable manual overrides).

## Implemented Safety Hardening (Issue #42)

### Budget cap
- Repository-scoped mutating run budget gate in intake path.
- Default tunables:
  - `WEBHOOK_REPO_MUTATING_BUDGET_LIMIT=25`
  - `WEBHOOK_REPO_MUTATING_BUDGET_WINDOW_MINUTES=60`
- Deterministic block reason: `budget_exhausted`.

### Circuit breaker
- Repository circuit breaker opens when either threshold is reached in the active window:
  - total failures threshold (`WEBHOOK_CIRCUIT_BREAKER_FAILURE_THRESHOLD`)
  - repeated signature threshold (`WEBHOOK_CIRCUIT_BREAKER_SIGNATURE_THRESHOLD`)
- Default tunables:
  - `WEBHOOK_CIRCUIT_BREAKER_WINDOW_MINUTES=30`
  - `WEBHOOK_CIRCUIT_BREAKER_COOLDOWN_MINUTES=30`
- Deterministic reasons:
  - intake block while open: `circuit_breaker_open`
  - trip event reason: `circuit_breaker_tripped`

### Override flow (auditable)
- Maintainer-only control commands:
  - `pause-loop <chain-id> <reason>`
  - `resume-loop <chain-id> <reason>`
  - `override-cooldown <chain-id> <reason>`
  - `override-circuit-breaker <reason>` (repository scoped)
- All override actions are recorded with `actor`, `reason`, `action`, and scope metadata.
