# Get-shit-done Adoption Decision (Issue #18)

Date: 2026-02-03
Status: Decision complete

## Objective
Decide whether Get-shit-done should be adopted in `Remote-Agentic-Coding-System`, and at what depth.

## Options Evaluated

### A) Adopt directly
Use GSD command system and workflow model as-is.

Pros:
- Fast reuse of mature, battle-tested process patterns.

Cons:
- Runtime support is primarily documented for Claude/OpenCode/Gemini, not Codex-first usage.
- High overlap/conflict risk with current `.agent/` workflow conventions.
- Higher migration complexity and operator confusion.

### B) Partial adaptation (selected)
Adopt selected concepts and patterns, but keep this repo's existing workflow contracts and tooling.

Pros:
- Preserves current issue-first and `.agent/` artifacts.
- Enables incremental improvements with low disruption.
- Avoids runtime coupling risk.

Cons:
- Requires curation/mapping effort.
- Some duplication with upstream concepts remains.

### C) Inspiration-only
Use GSD only as reference; no explicit integration backlog.

Pros:
- No migration cost.

Cons:
- Leaves potential process quality gains unrealized.

## Decision
Choose **B) Partial adaptation**.

## Why
- Best fit for current architecture and operating model.
- Lowest implementation risk while still extracting value.
- Clear path to improve planning/execution quality without replacing stable workflows.

## Migration Effort Estimate
- Phase 1 (mapping/design): low
- Phase 2 (pilot workflow adjustments): medium
- Phase 3 (broader rollout + documentation): medium

## Proposed Phases
1. Pattern mapping:
   - map transferable GSD concepts to `.agent/workflows/*`
   - identify non-transferable runtime-specific assumptions
2. Pilot:
   - apply selected changes to one issue workflow family
   - measure quality/rework impact
3. Rollout:
   - standardize successful changes across default workflow set
   - update documentation and contributor guidance

## Risks
- Overfitting to external workflow semantics that conflict with repo norms.
- Process churn without measurable gain.
- Ambiguity if both original and adapted terminology coexist.

Mitigations:
- keep canonical source of truth in `.agent/rules/00-core.md`
- apply changes in small, measurable increments
- maintain compatibility with current issue/plan/report contracts

## Follow-up
Implementation tracking issue: **#28 - Pilot selective GSD pattern adoption into default workflows**
(https://github.com/imKXNNY/Remote-Agentic-Coding-System/issues/28)