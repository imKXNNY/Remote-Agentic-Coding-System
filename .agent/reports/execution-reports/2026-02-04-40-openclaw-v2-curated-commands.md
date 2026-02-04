# Execution Report - Issue #40 OpenClaw v2 Curated Commands

## Summary
Expanded the OpenClaw bridge from PoC to a curated command surface with capability-aware policy evaluation and deterministic blocked/unsupported responses.

## Changes
- Added OpenClaw command registry and capability map in `src/routes/openclaw.ts`:
  - capabilities: `read_only`, `needs_approval`, `mutating`
  - enabled command set derived from `OPENCLAW_BRIDGE_ALLOWED_COMMANDS`
- Added new read-only commands:
  - `/metrics`
  - `/runs [limit]`
  - `/events <runId> [limit]`
- Enforced capability-aware policy behavior:
  - mutating capability routes through policy as `isMutating=true`
  - unknown command remains deterministic `blocked_policy`
- Added deterministic unsupported handling:
  - allowlisted-but-not-implemented command returns `501` with `unsupported_command`
- Extended tests in `src/routes/openclaw.test.ts` for:
  - new command success paths
  - blocked unknown command path
  - mutating capability approval behavior
  - deterministic unsupported response
- Added analysis doc:
  - `docs/OpenClaw/analysis/openclaw-v2-curated-commands.md`

## Validation
- `npm run type-check` passed
- `npm run lint` passed (warnings-only baseline)
- `npm test -- src/routes/openclaw.test.ts` passed
- `npm test` passed
- `npm run build` passed

## Notes
`/events` intentionally returns a safe event subset (without raw metadata) to reduce accidental data leakage in OpenClaw command output.
