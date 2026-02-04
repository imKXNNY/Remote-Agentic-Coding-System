# Automation Operations Runbook

This runbook covers operator actions for the autonomous webhook loop safety controls.

## Safety Controls

- **Repository mutating budget cap**: blocks new mutating runs when the repository budget for the active window is exhausted.
- **Circuit breaker**: trips to `open` when recent failure volume/signature repetition crosses configured thresholds.
- **Manual overrides**: maintainer-only commands with audit records (`who`, `when`, `why`).

## Required Role

All control commands require repository maintainer permissions (`admin`, `maintain`, or `write`).

## Control Commands (GitHub comment)

Use these in issue/PR comments with `@remote-agent`.

### Pause a chain

```text
@remote-agent pause-loop <chain-id> <reason>
```

Expected response payload:
- `status: control_applied`
- `action: pause_loop`

### Resume a chain

```text
@remote-agent resume-loop <chain-id> <reason>
```

Expected response payload:
- `status: control_applied`
- `action: resume_loop`

### Override cooldown

```text
@remote-agent override-cooldown <chain-id> <reason>
```

Expected response payload:
- `status: control_applied`
- `action: override_cooldown`

### Override repository circuit breaker

```text
@remote-agent override-circuit-breaker <reason>
```

Expected response payload:
- `status: control_applied`
- `action: override_circuit_breaker`

### Evaluate merge gate (no side effects)

```text
@remote-agent merge-gate <pr-number> [--dry-run]
```

Expected response payload:
- `status: merge_gate_passed` or `merge_gate_denied`
- `decision: allow|deny`
- `denyReasons: [...]`

### Auto-merge with merge gate policy

```text
@remote-agent auto-merge <pr-number> [--dry-run] [--override <reason>]
```

Behavior:
- Denies merge if gate decision is `deny` and no override is provided.
- Allows merge if gate decision is `allow`.
- Allows audited bypass only with explicit `--override <reason>` by maintainer.

Expected response payload:
- `status: auto_merged` (merge performed)
- `status: auto_merge_dry_run` (dry-run, no merge)
- `status: merge_gate_denied` (blocked)

## Diagnostics and Observability

- Inspect run ledger: `GET /api/github/webhook-runs`
- Inspect run events: `GET /api/github/webhook-runs/:runId/events`
- Inspect aggregate metrics: `GET /api/github/webhook-metrics`

Look for reason codes:
- `budget_exhausted`
- `circuit_breaker_open`
- `circuit_breaker_tripped`
- `manual_override`
- `checks_missing`
- `checks_pending`
- `checks_failed`
- `review_changes_requested`
- `branch_not_up_to_date`

## Tunables (Environment)

- `WEBHOOK_REPO_MUTATING_BUDGET_LIMIT` (default `25`)
- `WEBHOOK_REPO_MUTATING_BUDGET_WINDOW_MINUTES` (default `60`)
- `WEBHOOK_CIRCUIT_BREAKER_FAILURE_THRESHOLD` (default `5`)
- `WEBHOOK_CIRCUIT_BREAKER_SIGNATURE_THRESHOLD` (default `3`)
- `WEBHOOK_CIRCUIT_BREAKER_WINDOW_MINUTES` (default `30`)
- `WEBHOOK_CIRCUIT_BREAKER_COOLDOWN_MINUTES` (default `30`)
- `WEBHOOK_MERGE_GATE_REQUIRED_CHECKS` (default empty => all observed checks must be green)
- `WEBHOOK_MERGE_METHOD` (`squash` default, `merge`, `rebase`)

