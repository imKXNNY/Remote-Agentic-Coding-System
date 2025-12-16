# Feature: Bake Gemini CLI Into Docker Image

The following plan should be complete, but validate documentation, codebase patterns, and task scope before implementing. Follow all referenced files closely to avoid regressions.

## Feature Description

Ensure dockerized deployments of the Remote Coding Agent always ship with the Gemini CLI available so the new assistant works out-of-the-box. This requires baking the CLI into the container image, clarifying documentation for container workflows, and tightening startup validation when the CLI is missing yet Gemini is configured as the default assistant.

## User Story

As a remote coding operator using docker-compose
I want the Gemini CLI to be available inside the container automatically
So that Gemini-based conversations run without manual container surgery or confusing warnings.

## Problem Statement

Docker images currently lack the Gemini CLI even when `DEFAULT_AI_ASSISTANT=gemini` is set. Operators following the verification checklist install the CLI on the host OS, but the containerized app runs in an isolated environment and immediately warns that the CLI is missing, blocking Gemini sessions.

## Solution Statement

Add the Gemini CLI installation step to the Docker build, document how container users should persist authentication, and adjust startup validation so misconfigured Gemini defaults fail fast with actionable messaging.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: Docker image (Dockerfile), runtime startup (`src/index.ts`), documentation (`README.md`, `docs/assistants/gemini.md`, `docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md`)
**Dependencies**: @google/gemini-cli (installed globally inside the container), Node.js 20 runtime already present.

---

## CONTEXT REFERENCES

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)

- `Dockerfile:1-66` – Current build steps for the production image. Need to insert Gemini CLI install and ensure appuser can execute it.
- `src/index.ts:31-75,240-245` – Environment validation and Gemini availability check (`isGeminiCliAvailable`). Adjust warning/fail-fast logic here.
- `docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md:1-23` – Checklist telling operators to install the CLI on the host. Must clarify container instructions.
- `docs/assistants/gemini.md:1-70` – Detailed Gemini CLI setup guide. Extend with docker-specific notes and persistence guidance.
- `README.md:1-200` – Primary setup guide (Core Configuration, Docker usage). Mention Gemini CLI presence in container build steps.
- `.agents/PRD.md:9-200` – Architectural principles (commands in repo, env-based credentials, session transitions). Ensure new logic respects single-developer simplicity and warning semantics.
- `docs/rca/issue-gemini-cli-warning.md` – RCA context for why this feature exists; align fix scope with analysis.

### New Files to Create

- _None expected_ (use existing docs/plan directories only).

### Relevant Documentation (READ THESE SECTIONS)

- [docs/assistants/gemini.md](docs/assistants/gemini.md#prerequisites) – Explains CLI requirements and behavior.
- [docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md](docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md#environment-prep) – Checklist describing environment prep.
- [README.md](README.md#setup-guide) – Contains Docker instructions and should mention Gemini CLI install/bake process.
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli#installation) – Official installation guidance; cite version/pinning if needed.

### Patterns to Follow

- **Logging**: Use structured console logs per `src/index.ts` (`console.warn('[App] ...')`).
- **Env validation**: Current pattern collects `missing` env vars, warns but doesn’t exit unless all assistants missing (lines 38-58). Add fail-fast while following same logging style.
- **Docker layering**: Each dependency install (apt-get, npm) occurs before copying source to leverage caching. Add CLI install after Node dependencies but before switching to non-root user to avoid permission issues.
- **Docs formatting**: Use markdown bullet lists and fenced code blocks consistent with README and docs.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

Establish image requirements and documentation expectations before code changes.

**Tasks**
- Confirm latest stable `@google/gemini-cli` version from upstream documentation.
- Decide where to install CLI in Dockerfile (global npm install vs. direct binary download) considering image size and caching.
- Determine how users should persist `~/.gemini` via docker volumes; capture instructions for docs.

### Phase 2: Core Implementation

Bake CLI into image and improve startup validation.

**Tasks**
- Update Dockerfile to install the Gemini CLI (`npm install -g @google/gemini-cli`) after `npm ci` (still root) and ensure PATH includes npm global binaries for `appuser` (append to `.bashrc` or export via `ENV PATH` if necessary).
- Ensure `/home/appuser/.gemini` directory exists and is writable; optionally document volume mount requirement.
- Update `src/index.ts` so when `DEFAULT_AI_ASSISTANT=gemini` (or any codebase uses Gemini) and CLI missing, the app exits with actionable error instead of continuing with warnings.

### Phase 3: Integration

Document user-facing changes and align instructions with new behavior.

**Tasks**
- Update README (Docker section) to mention CLI is included, but `gemini login` still must run inside container once; show example `docker compose exec app gemini login` and volume mount guidance.
- Update `docs/assistants/gemini.md` with a container section describing how to persist CLI auth (mount host `$HOME/.gemini` or dedicated volume) and referencing `GEMINI_CLI_PATH` overrides if customizing.
- Update `docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md` environment prep to differentiate between bare-metal and docker runs (clarify that for docker, CLI is preinstalled and login must happen inside container or via mounted config).

### Phase 4: Testing & Validation

Ensure image builds and runtime validation behave as expected.

**Tasks**
- Rebuild docker image (`docker compose build`). Verify CLI presence via `docker compose exec app gemini --version`.
- Run `docker compose up` with `DEFAULT_AI_ASSISTANT=gemini`; ensure no startup warnings, and that CLI sessions run (smoke test `/test/message` or `/command-invoke` once workspace configured).
- Manually set `GEMINI_CLI_PATH` to invalid value to confirm new fail-fast behavior (should exit with clear error).
- Run repo validation commands (`npm run type-check`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run build`).

---

## STEP-BY-STEP TASKS

### UPDATE Dockerfile

- **IMPLEMENT**: Install `@google/gemini-cli` globally after `npm ci`, ensure PATH includes `/usr/local/bin` for `appuser`, and create `/home/appuser/.gemini`.
- **PATTERN**: Follow existing apt/npm install steps (Dockerfile:8-45) and permission fixes (Dockerfile:47-55).
- **IMPORTS**: n/a (Dockerfile commands).
- **GOTCHA**: npm global prefix may resolve to `/usr/local/bin`; ensure `appuser` inherits PATH. Consider `npm cache clean --force` to keep image smaller.
- **VALIDATE**: `docker compose build` followed by `docker compose run --rm app gemini --version`.

### UPDATE src/index.ts

- **IMPLEMENT**: When `defaultAssistant === 'gemini'` and `hasGeminiCli` is false, log error and exit process with instructions (e.g., “Ensure gemini CLI installed in container or set GEMINI_CLI_PATH”). Optionally extend to check active codebases configured for Gemini.
- **PATTERN**: Use same logging style as lines 38-58 and failure exit used for missing envs (lines 23-43).
- **IMPORTS**: none new.
- **GOTCHA**: Don’t break existing warnings for Claude/Codex; only escalate when Gemini is the only requested assistant or default.
- **VALIDATE**: `npm run lint`, `npm run type-check`, plus manual run with `DEFAULT_AI_ASSISTANT=gemini` and CLI temporarily removed to ensure exit occurs.

### UPDATE README.md

- **IMPLEMENT**: In Docker setup section, mention CLI is included, show commands to run `gemini login` inside container, explain mounting `~/.gemini` volume (e.g., `- ./gemini:/home/appuser/.gemini`). Reference new docs section.
- **PATTERN**: Match markdown style (section headings, code fences) near lines 34-120.
- **VALIDATE**: `npm run format:check` (markdown unaffected but ensure no Prettier diff).

### UPDATE docs/assistants/gemini.md

- **IMPLEMENT**: Add sections for “Docker Deployments” describing baked CLI, login steps inside container, persistence via volume, mention `GEMINI_CLI_PATH` for custom setups.
- **PATTERN**: Keep bullet formatting consistent (lines 1-70).
- **VALIDATE**: `npm run format:check`.

### UPDATE docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md

- **IMPLEMENT**: Distinguish environment prep steps for bare-metal vs docker. Provide explicit commands for `docker compose exec app gemini login` and verifying `gemini --version` inside container.
- **PATTERN**: Maintain current bullet numbering style.
- **VALIDATE**: `npm run format:check`.

### OPTIONAL: UPDATE docs/rca/issue-gemini-cli-warning.md (append “Resolution” section once implemented)

- **IMPLEMENT**: Document fix summary referencing Dockerfile and new validation behavior.
- **PATTERN**: Add final section at bottom.
- **VALIDATE**: `npm run format:check`.

### GLOBAL VALIDATION

- **COMMANDS**:
  - `npm run lint`
  - `npm run type-check`
  - `npm run test`
  - `npm run build`
  - `npm run format:check`
  - `docker compose build`
  - `docker compose run --rm app gemini --version`
  - `docker compose up -d && docker compose logs app | grep "Gemini CLI"`

---

## TESTING STRATEGY

### Unit Tests

- No new unit tests expected, but run entire Jest suite (`npm run test`) to guard against regressions from startup changes.

### Integration Tests

- Manual verification via docker-compose to ensure CLI detection and `/test` endpoint works with Gemini.
- Consider adding a lightweight CI step to run `gemini --version` inside container (if feasible in pipeline).

### Edge Cases

- `DEFAULT_AI_ASSISTANT=gemini` but CLI missing → process should exit with clear error.
- CLI installed but `GEMINI_CLI_PATH` overrides to invalid path → still error.
- Non-Gemini deployments (Claude/Codex only) should not be impacted by new checks.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
npm run type-check
npm run lint
npm run format:check
```

### Level 2: Unit Tests

```bash
npm run test
```

### Level 3: Build

```bash
npm run build
```

### Level 4: Docker Validation

```bash
docker compose build
docker compose run --rm app gemini --version
docker compose up -d
docker compose exec app gemini --output-format stream-json --prompt "smoke test" | head
```

### Level 5: Manual Workflow Validation

1. Run `docker compose exec app bash -lc "DEFAULT_AI_ASSISTANT=gemini npm start"` (should start clean).
2. Execute `/test/message` or Telegram command to confirm Gemini responses.

---

## ACCEPTANCE CRITERIA

- [ ] Docker image includes Gemini CLI and exposes it to `appuser`.
- [ ] Startup exits with actionable error when Gemini is default but CLI missing/invalid.
- [ ] Documentation (README, Gemini guide, verification checklist) reflects new behavior and provides docker instructions.
- [ ] `gemini --version` succeeds inside container right after build.
- [ ] Repo validation commands pass (lint, type-check, tests, build).
- [ ] Manual workflow demonstrates Gemini streaming without warnings.

---

## COMPLETION CHECKLIST

- [ ] Dockerfile updated, image rebuilt, CLI verified.
- [ ] Startup validation adjustments merged.
- [ ] All documentation updated and formatted.
- [ ] RCA document annotated (optional but recommended).
- [ ] Validation commands executed with exit code 0.
- [ ] Manual docker verification completed.

---

## NOTES

- Ensure container image still runs as `appuser` with correct PATH. If npm global binaries install into `/usr/local/bin`, confirm `PATH` contains it (set `ENV PATH="/usr/local/bin:$PATH"`).
- Consider pinning `@google/gemini-cli` version for reproducible builds; revisit periodically for updates.
- If CLI requires interactive login, document how to run `gemini login` inside container and persist `/home/appuser/.gemini` across restarts (e.g., bind mount host directory or Docker named volume).
- If future assistants require external binaries, replicate this pattern to keep docker images self-contained.
