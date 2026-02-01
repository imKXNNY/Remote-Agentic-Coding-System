# Root Cause Analysis: GitHub Issue [#6](https://github.com/imKXNNY/Remote-Agentic-Coding-System/issues/6)

## Summary
When bootstrap auto-provisioning encounters a danger-mode approval gate or setup failure, the orchestrator still proceeds to the AI execution flow. This allows Codex/Claude to run commands without the required environment, negating the safety check.

## Symptoms
- Agent continues running plan/execute on repositories marked danger-full-access where provisioning was not approved.
- AI errors occur immediately after bootstrap reported failure, because dependencies were never installed.

## Root Cause
`handleMessage` in `src/orchestrator/orchestrator.ts` calls `bootstrap.runBootstrap(...)` but ignores the result unless it's `success`. The function does not return or halt when statuses `needs-approval` or `failed` are returned, so the downstream AI pipeline always runs.

## Contributing Factors
- The initial bootstrap integration only sent a friendly message but did not treat bootstrap gating as a hard stop.
- There were no end-to-end tests covering "bootstrap failed" or "danger mode approval required" branches.

## Fix Strategy
1. `src/orchestrator/orchestrator.ts`: After running bootstrap, if status is `needs-approval` or `failed`, send the message **and return early** to halt AI processing.
2. Add regression coverage by running lint + tests to ensure no new errors and update manual test steps focusing on bootstrap states.

## Tests Needed / Validation Plan
- Unit tests are not currently in place for bootstrap gating; rely on manual integration and ensure existing test suite (`npm test`) passes.
- Re-run `npm run type-check`, `npm run lint`, `npm test`, `npm run build` to confirm no regressions.

## Risks
- Minimal: early return only affects error/approval branches, so normal bootstrap success paths remain untouched.
- Ensure repeated `/bootstrap force` still works since early return only applies to non-success statuses.
