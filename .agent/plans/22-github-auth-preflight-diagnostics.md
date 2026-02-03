# Issue #22 - GitHub Auth Preflight Diagnostics

Issue: `#22`
Repo: `imKXNNY/Remote-Agentic-Coding-System`
Date: 2026-02-03

## Goal
Improve GitHub auth robustness and observability so misconfiguration is obvious and API behavior is deterministic when GitHub auth is unavailable.

## Acceptance Criteria
- [ ] Missing/invalid GitHub token results in clear, actionable error output.
- [ ] `/api/github/issues` returns a deterministic error payload when auth is unavailable.
- [ ] No token values are logged in plaintext.
- [ ] Happy path behavior remains unchanged when token is valid.

## Touch Points
- `src/routes/github.ts`
- `src/index.ts`
- `src/handlers/command-handler.ts`
- `src/utils/github-auth.ts` (new)
- `src/utils/github-auth.test.ts` (new)
- `README.md`

## Implementation Slices

### Slice 1 - Centralized auth diagnostics utility
1. Add `src/utils/github-auth.ts` with:
   - token resolution (`GITHUB_TOKEN` fallback to `GH_TOKEN`)
   - token masking helper (never log secrets)
   - preflight summary (presence, shape hints, source env var)
   - standardized API error payload builder for auth failures
2. Keep utility pure where possible for focused tests.

### Slice 2 - Harden `/api/github/issues`
1. In `src/routes/github.ts`, move from static module-level Octokit init to request-time guarded client creation.
2. Return deterministic errors:
   - `503` when token missing/malformed with actionable next steps
   - `502` when upstream auth/permission errors occur
3. Keep successful response shape unchanged.
4. Ensure logs include context but never raw token.

### Slice 3 - Startup and command-path diagnostics
1. In `src/index.ts`, add startup preflight log for GitHub token readiness (sanitized).
2. In `/clone` command (`src/handlers/command-handler.ts`), use same token resolution (`GITHUB_TOKEN ?? GH_TOKEN`) for consistency.

### Slice 4 - Tests and docs
1. Add targeted unit tests for `github-auth` utility.
2. Add route-level regression tests for deterministic auth error behavior.
3. Update README troubleshooting/docs with GitHub auth preflight behavior and expected scopes caveat.

## Risks / Edge Cases
- Private repo access may fail with insufficient scopes even if token exists.
- GitHub API can return both auth and rate-limit errors; map only auth-class failures to deterministic auth messaging.
- Keep route output backward-compatible for happy path.

## Verification Commands
- `npm run type-check`
- `npm run lint`
- `npm test -- src/utils/github-auth.test.ts src/routes/github.test.ts`
- `npm test`
- `npm --prefix webui run check`
- `npm run build`

## Execution Contract
- **Issue:** `#22`
- **Branch:** `fix/22-github-auth-preflight-diagnostics`
- **Plan file path:** `.agent/plans/22-github-auth-preflight-diagnostics.md`