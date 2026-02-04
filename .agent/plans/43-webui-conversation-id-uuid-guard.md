# Issue #43 - WebUI UUID guard for temporary conversation IDs

## Goal
Prevent Postgres UUID parse errors when WebUI requests context/commands for temporary conversation ids like `default-<timestamp>`.

## Acceptance Criteria
- [ ] `/api/conversations/:id/context` handles non-UUID ids deterministically without 500.
- [ ] `/api/conversations/:id/commands` handles non-UUID ids deterministically without 500.
- [ ] No DB query is executed for invalid UUID ids in these routes.
- [ ] Regression tests exist for `default-<timestamp>` style ids.

## Files to change
- `src/index.ts`
- `src/utils/uuid.ts` (new)
- `src/utils/uuid.test.ts` (new)
- `src/db/messages.ts` (reuse helper)

## Plan
1. Add shared UUID validation helper.
2. Use helper in affected WebUI routes before DB access.
3. Reuse helper in `getMessages` to remove regex duplication.
4. Add regression tests for helper behavior, including `default-<timestamp>`.
5. Run type-check, lint, and targeted tests.
