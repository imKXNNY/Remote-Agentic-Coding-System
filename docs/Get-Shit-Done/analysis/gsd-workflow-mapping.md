# GSD -> .agent Workflow Mapping (Pilot for Issue #28)

Date: 2026-02-04
Related issues: #18, #28

## Mapping Table

| GSD concept | Existing touchpoint in this repo | Adoption status | Notes |
|---|---|---|---|
| Phase discipline (plan -> execute -> verify) | `.agent/workflows/end-to-end-feature.md`, `.agent/workflows/plan-feature.md`, `.agent/workflows/execute.md`, `.agent/workflows/validate-simple.md` | Adopted | Already canonical in this repo. |
| Spec-first execution contract | `.agent/workflows/plan-feature.md` + `.agent/plans/<id>-<slug>.md` | Adopted | Plan artifact is required before execution. |
| Continuity checkpoints during execution | `.agent/workflows/execute.md` | Pilot-adjusted | Added explicit `Done / Evidence / Next` per-slice checkpoint contract. |
| Verification gates before completion | `.agent/workflows/validate-simple.md`, `.agent/workflows/validate.md` | Adopted | Repo uses repeatable command-based verification. |
| Milestone audit / reporting | `.agent/workflows/execution-report.md`, `.agent/reports/execution-reports/` | Adopted | Existing reporting path retained. |
| Runtime-specific command wrappers (`/gsd:*`) | N/A | Not adopted | Conflicts with current `.agent/workflows/*` command model; no Codex-native need. |
| Agent-runtime specific assumptions | N/A | Not adopted | Kept out to avoid coupling to Claude/OpenCode/Gemini semantics. |

## Pilot Boundary
- Keep `.agent/rules/00-core.md` as canonical source of truth.
- Preserve issue-first tracking and current branch/plan/report contracts.
- Introduce only one process delta in pilot (checkpoint contract in `execute.md`).

## Expected Outcomes
- Better handoff clarity between slices.
- Lower risk of hidden assumptions during long runs.
- No tooling/runtime changes.
