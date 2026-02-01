# Root Cause Analysis: GitHub Issue [#8](https://github.com/imKXNNY/Remote-Agentic-Coding-System/issues/8)

## Summary
Bootstrap auto-provisioning always marks success whenever the AI command loop completes without throwing, even if the model never confirmed success. Ambiguous completions therefore block future `/bootstrap` runs and leave the repo unprovisioned.

## Symptoms
- `bootstrap_status` becomes `success` despite missing tools/dependencies.
- Subsequent `/bootstrap` invocations are skipped because the conversation is marked success.
- Users must manually force `/bootstrap force` or reset the conversation.

## Root Cause
`runBootstrap` in `src/utils/bootstrap.ts` sets `bootstrap_status = 'success'` unconditionally after iterating `aiClient.sendQuery`. The `success` flag is only used for logging; even when no confirmation string is seen, the function still writes success and returns.

## Contributing Factors
- No guard ensuring the AI output contained “success/done/finish”.
- No tests or telemetry tracking ambiguous outcomes.
- Desire to avoid repeated bootstrap led to auto-marking success as long as no exception was thrown.

## Fix Strategy
1. Update `runBootstrap` so that if `success === false`, the conversation is marked `failed` (or another retryable state) and the function returns with a failure message.
2. Only mark `success` and update `last_bootstrap_at` when explicit confirmation is observed.
3. Consider logging the AI response for debugging and prompting the user to run `/bootstrap force` when ambiguous.

## Tests Needed
- End-to-end manual test: simulate bootstrap where the AI response omits “success” and verify status becomes `failed`.
- Run existing suite (`npm run type-check`, `npm run lint`, `npm test`, `npm run build`) after code change.
- Future enhancement: unit/integration test around `runBootstrap` to assert status transitions.

## Risks
- False negatives: if the AI uses unexpected phrasing for success, we may mark failure even though provisioning succeeded. Mitigate by broadening the confirmation phrases and providing a `/bootstrap force` escape hatch.
- Need to ensure the orchestrator’s bootstrap gating handles the new failure path (Issue #6 already added early return).
