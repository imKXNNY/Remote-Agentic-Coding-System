# OpenClaw Bridge v2 - Curated Commands and Capability Policy

Issue: #40  
Date: 2026-02-04

## What changed
OpenClaw bridge moved from PoC single-command behavior to a curated command registry with explicit capabilities and deterministic outcomes.

## Curated command set
The bridge now resolves commands from a registry and then applies `OPENCLAW_BRIDGE_ALLOWED_COMMANDS` as an explicit enable-list.

Default enabled commands:
- `/status` (`read_only`) - aggregate status summary + recent runs
- `/metrics` (`read_only`) - webhook metrics snapshot for OpenClaw platform
- `/runs [limit]` (`read_only`) - recent run list (default `10`, max `50`)
- `/events <runId> [limit]` (`read_only`) - event timeline for a run (default `20`, max `200`)

Optional command class present for future workflow:
- `/execute` (`mutating`) - intentionally not implemented yet; returns deterministic unsupported response if it passes policy and reaches execution.

## Capability-aware policy behavior
Capability now directly influences policy evaluation:
- `read_only` -> evaluated as non-mutating (`isMutating=false`)
- `mutating` -> evaluated as mutating (`isMutating=true`), which triggers branch/risk guardrails
- `needs_approval` -> reserved class; auto-escalates to approval when base policy would allow

## Deterministic outcomes
- Unknown/disallowed command: `202` with `status: blocked_policy`, `reason: command_not_allowed`
- Allowlisted-but-not-implemented command: `501` with `status: unsupported_command`
- Runtime failure in implemented command: `500` with `status: execution_failed`

## Notes
- The `/events` command intentionally returns a safe subset (no raw metadata object), reducing accidental sensitive-data exposure in OpenClaw command responses.
- This v2 keeps the surface intentionally small and auditable while extending operational usefulness beyond PoC.
