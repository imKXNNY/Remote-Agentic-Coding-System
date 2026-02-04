# OpenClaw Interop PoC Decision Memo (Issue #26)

Date: 2026-02-04
Status: PoC completed

## Decision
**Continue (guarded expansion).**

## Why
- The PoC confirms low-risk interoperability can be achieved without replacing core architecture.
- Safety controls are active through existing policy + control-plane guardrails:
  - repo/branch allowlist (policy)
  - command allowlist (OpenClaw route)
  - dedupe/replay handling (control-plane)
  - max-iteration and cooldown limits (control-plane)
- Observability is preserved via run lifecycle records and response linkage (`eventId`, `runId`, `chainId`).

## Limitations observed
- Current PoC intentionally supports one command (`/status`) only.
- Shared-secret header auth is minimal; stronger signed payload verification may be needed before broader exposure.

## Recommended next step
- Expand to one additional read-only command (for example `/webhook-metrics`) only after:
  - production-like replay tests,
  - secret-rotation guidance,
  - tighter request-signature validation design.

## Stop criteria
Pause expansion if any of the following occur:
- repeated policy bypass attempts,
- evidence of replay abuse not mitigated by dedupe,
- ambiguity around event source trust boundaries.
