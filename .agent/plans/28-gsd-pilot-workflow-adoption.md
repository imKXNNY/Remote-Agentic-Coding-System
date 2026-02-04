# Issue #28 - Pilot selective GSD pattern adoption into default workflows

Issue: `#28`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-04

## Goal
Pilot selective adoption of Get-shit-done process patterns (phase discipline, verification rigor, continuity checkpoints) into canonical `.agent` workflows without changing the repo's issue/plan/report contracts.

## Acceptance Criteria
- [ ] Produce mapping table: GSD concept -> existing workflow touchpoint.
- [ ] Implement one pilot adjustment in default workflows.
- [ ] Validate pilot on a real issue flow.
- [ ] Document measured outcomes and recommendation.
- [ ] Pilot merged with no regression to current end-to-end flow.
- [ ] Decision recorded: expand, adjust, or stop.

## Touch Points
- `docs/Get-Shit-Done/analysis/` (new mapping + pilot evaluation docs)
- `.agent/workflows/execute.md` (single pilot workflow adjustment)
- `.agent/workflows/end-to-end-feature.md` (minor alignment update if needed)
- `.agent/reports/execution-reports/` (execution artifact for #28)

## Execution Slices

### Slice 1 - Mapping table artifact
1. Create a concise mapping document from evaluated GSD concepts to current `.agent` workflows.
2. Mark each concept as transferable, partial, or not adopted.
3. Keep references to canonical contracts in `.agent/rules/00-core.md`.

### Slice 2 - Pilot adjustment implementation
1. Implement one low-risk adjustment in default workflow docs:
   - Add explicit slice checkpoint contract to `execute.md` (Done/Evidence/Next per slice).
2. Ensure the change is documentation/process only and preserves existing branch/plan/report conventions.

### Slice 3 - Pilot validation and recommendation
1. Validate pilot against this real issue flow (#28) by recording:
   - whether checkpoint format was used,
   - any observed clarity/rework impact,
   - any friction introduced.
2. Write recommendation outcome: expand, adjust, or stop (with rationale).

### Slice 4 - Validation and reporting
1. Run repo validation commands to confirm no regression.
2. Produce execution report for #28 with verification evidence.

## Edge Cases
- Avoid importing runtime/tooling assumptions specific to non-Codex agents.
- Avoid duplicating or conflicting with `.agent/rules/00-core.md` conventions.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#28`
- **Branch:** `feature/28-gsd-pilot-workflow-adoption`
- **Plan file path:** `.agent/plans/28-gsd-pilot-workflow-adoption.md`
