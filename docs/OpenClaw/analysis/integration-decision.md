# OpenClaw Integration Decision (Issue #25)

Date: 2026-02-03
Status: Decision complete

## Objective
Determine whether OpenClaw should be integrated into `Remote-Agentic-Coding-System`, and at what depth.

## Architecture Fit Summary
`Remote-Agentic-Coding-System` already uses a strong adapter/orchestrator model:
- platform adapters (Telegram, GitHub, WebUI, MCP mode)
- orchestration + command handling
- assistant-client abstraction (Claude/Codex)
- persistent conversation/session/codebase state

OpenClaw is best interpreted as a broader personal-assistant runtime/control-plane, not a drop-in replacement for this repo's coding-focused orchestration. The overlap is high at the "agent runtime" layer, but this repo's value is the coding workflow contract around issues, plans, validation, and PR loops.

## Options Evaluated

### 1) Loose interoperability (API/webhook bridge)
Description:
- Keep current architecture as source of truth.
- Add an interop boundary where OpenClaw can trigger curated workflows (for example issue triage or PR follow-up) and receive status/events.

Pros:
- Lowest risk and smallest blast radius.
- Preserves current coding workflow and GitHub issue-first process.
- Fastest path to practical value.

Cons:
- Some duplicated orchestration capabilities remain.
- Requires careful event/loop control design.

### 2) Deep adapter integration
Description:
- Embed OpenClaw directly as a core runtime/adapter layer.

Pros:
- Potentially richer multi-channel capability and personal-assistant features.

Cons:
- High complexity and coupling.
- Larger security/operational blast radius.
- Significant migration risk for current stable workflows.

### 3) No integration (inspiration only)
Description:
- Keep OpenClaw as research input and do not integrate.

Pros:
- Zero implementation risk.

Cons:
- Misses potential automation and multi-channel leverage.

## Security / Ops Implications
- Any interop path must enforce strict allowlists (repos, branches, command classes).
- External trigger loops require dedupe keys, max-iteration limits, and cooldown windows.
- Token scope separation is mandatory (least privilege for GitHub/event actors).
- All automation must remain auditable with run IDs and traceable event chains.

## Decision
Proceed with **Option 1: loose interoperability first**.

Rationale:
- Best risk/reward tradeoff.
- Keeps this repository's proven coding workflow semantics intact.
- Creates a reversible foundation for deeper integration only if real usage justifies it.

## Roadmap (Phased)
1. Design phase:
   - event contract, trigger matrix, and guardrails
   - idempotency and loop prevention
2. PoC phase:
   - one or two low-risk triggers (read-only or constrained write actions)
3. Expansion phase:
   - broaden trigger coverage after observability and safety metrics are stable

## Follow-up
Implementation tracking issue: **#26 - OpenClaw interop PoC: constrained webhook/event bridge** (https://github.com/imKXNNY/Remote-Agentic-Coding-System/issues/26)
