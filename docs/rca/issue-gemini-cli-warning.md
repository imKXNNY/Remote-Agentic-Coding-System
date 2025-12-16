# Root Cause Analysis: GitHub Issue #Gemini CLI warning when running docker compose stack

## Issue Summary

- **GitHub Issue ID**: Gemini CLI warning when following `docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md`
- **Issue URL**: _Not available via `gh issue view` – the provided identifier is descriptive text rather than a numeric issue ID._
- **Title**: Warning about Gemini CLI not being available even though checklist was followed
- **Reporter**: Unknown (issue details provided in task description)
- **Severity**: Medium – Gemini conversations cannot run when the CLI is missing, blocking verification of the new assistant
- **Status**: Observed on `main` during docker-compose start

## Problem Description

Following the full verification checklist and starting the docker compose stack produced a runtime warning:
```
[App] Gemini CLI not found (expected binary: gemini). Gemini assistant will be unavailable. DEFAULT_AI_ASSISTANT is set to gemini.
```
The server continued to run, but Gemini-specific commands could not execute because the orchestrator never located the CLI binary.

**Expected Behavior:**
- With `DEFAULT_AI_ASSISTANT=gemini` set while running the docker stack, Gemini should be available as soon as the checklist prerequisites are met.

**Actual Behavior:**
- Startup emits a warning and Gemini sessions are disabled. The default assistant falls back, so `/command-invoke` flows cannot use Gemini.

**Symptoms:**
- Warning emitted at startup.
- Gemini conversations never start; only Claude/Codex remain.
- Checklist can’t be completed because tool-call verification depends on Gemini responses.

## Reproduction

**Steps to Reproduce:**
1. Set `DEFAULT_AI_ASSISTANT=gemini` in `.env`.
2. Run `docker compose up --build` (per verification checklist).
3. Observe container logs – warning appears before Express health endpoints register.

**Reproduction Verified:** Yes (log excerpt provided in the issue description and reproducible locally by running containers without the CLI installed inside).

## Root Cause

### Affected Components

- **Files**:
  - `src/index.ts`: Gemini availability check (`isGeminiCliAvailable`) emits warning when binary missing.
  - `Dockerfile`: Builds runtime image without installing the Gemini CLI.
  - `docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md`: Instructs users to install Gemini CLI on “the host running the Remote Coding Agent,” which is ambiguous for dockerized runs.
- **Functions/Classes**:
  - `isGeminiCliAvailable` in `src/index.ts:240`.
- **Dependencies**:
  - External `@google/gemini-cli` binary (must be present in container PATH).

### Analysis

`src/index.ts` resolves `geminiBinary = process.env.GEMINI_CLI_PATH || 'gemini'` and immediately tests it with `spawnSync(binary, ['--version'])` (lines 32‑57, 240‑245). When the CLI isn’t installed, `hasGeminiCli` is false and a warning is printed, especially noisy when `DEFAULT_AI_ASSISTANT=gemini`.

The docker image defined in `Dockerfile` installs Node, git, gh, etc., but never installs the Gemini CLI (lines 8‑65). Installing it on the host machine does not help because the agent runs entirely inside the container; the CLI inside the host OS is not visible to the container.

The verification checklist (docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md:3‑8) tells operators to `npm install -g @google/gemini-cli` on “the host running the Remote Coding Agent.” For docker-compose deployments, “host” effectively means the container image. Because the Dockerfile doesn’t install the CLI (and no volume/bind mount was set up), the binary is missing even though instructions were followed on the physical host.

**Why This Occurs:**
- Docker image lacks Gemini CLI; host-level installation is isolated from container runtime.
- Documentation assumes bare-metal execution, so users following the checklist for docker-compose believe they’re compliant even though the container environment still misses the binary.
- With `DEFAULT_AI_ASSISTANT=gemini`, the orchestrator explicitly warns due to `hasGeminiCli=false` and refuses to run Gemini sessions.

**Code Location:**
```
src/index.ts:32-57,240-245
  const geminiBinary = process.env.GEMINI_CLI_PATH || 'gemini';
  const hasGeminiCli = isGeminiCliAvailable(geminiBinary);
  ...
  if (!hasGeminiCli) {
    const warning = `[App] Gemini CLI not found (expected binary: ${geminiBinary}). Gemini assistant will be unavailable.`;
    ...
  }

function isGeminiCliAvailable(binary: string): boolean {
  try {
    const result = spawnSync(binary, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}
```

### Related Issues

- Same warning appears any time Gemini CLI is absent (docs’ “Fallback Checks” at lines 19‑21 describe intentionally provoking it). In this case it was unintentional because docker images don’t include the binary by default.

## Impact Assessment

**Scope:**
- All docker-compose deployments that set `DEFAULT_AI_ASSISTANT=gemini` or load a Gemini codebase will fail to use Gemini unless operators manually install the CLI inside the running container.

**Affected Features:**
- Gemini assistant flows (plan/execute, tool calls, streaming) cannot run.
- Full manual verification checklist cannot be completed via Docker.

**Severity Justification:**
- Blocks Gemini assistant functionality in containerized environments, but Claude/Codex continue to work, so severity is Medium rather than Critical.

**Data/Security Concerns:**
- None – functionality is unavailable rather than unsafe.

## Proposed Fix

### Fix Strategy

1. Install the Gemini CLI inside the Docker image (e.g., `npm install -g @google/gemini-cli` during build) so runtime containers always have the binary on PATH.
2. Update docs to clarify that docker deployments require the CLI inside the container (or provide an alternative of binding the host binary via volume/`GEMINI_CLI_PATH`).
3. Optionally enhance startup validation to fail fast when `DEFAULT_AI_ASSISTANT=gemini` but the binary is missing, preventing silent misconfiguration.

### Files to Modify

1. **Dockerfile**
   - Add installation step for `@google/gemini-cli` (or download binary) and ensure it’s available for the `appuser`.
   - Reason: Guarantees `isGeminiCliAvailable` passes inside docker-compose images.

2. **docs/FULL-MANUAL-END-TO-END-VERIFICATION-CHECKLIST.md** (and/or README)
   - Clarify container instructions (install CLI inside container or bake it into image); mention `GEMINI_CLI_PATH` override if mounting host binary.
   - Reason: Aligns documentation with actual environment expectations to avoid future confusion.

3. **src/index.ts** (optional hardening)
   - If `DEFAULT_AI_ASSISTANT=gemini` but CLI absent, exit with actionable error instead of continuing.
   - Reason: Prevents partially configured deployments.

### Alternative Approaches

- Mount the host’s `gemini` binary into the container and point `GEMINI_CLI_PATH` there. Works but requires extra operator steps; not ideal for automated deployments.
- Provide a lightweight internal shim instead of installing the CLI globally. More work and duplicative compared to simply installing the official CLI.

### Risks and Considerations

- Installing Gemini CLI increases image size slightly and requires Node/npm availability during build (already present).
- Need to ensure CLI updates don’t break builds; consider pinning version.
- If `gemini login` still requires an interactive flow, operators may need to run the CLI inside the container once; document/login strategy accordingly (`~/.gemini` must be persisted via volume).

### Testing Requirements

1. **Docker build test:** Build the updated image and ensure the CLI binary exists (`gemini --version`).
2. **Startup test:** Run docker-compose with `DEFAULT_AI_ASSISTANT=gemini` and verify no warning appears; Gemini commands succeed.
3. **Regression test:** Temporarily set `GEMINI_CLI_PATH` to an invalid value to confirm warning still appears for misconfigurations.

**Validation Commands:**
```bash
# Build & run
docker compose build
docker compose up -d

# Inside container
docker compose exec app gemini --version
```

## Implementation Plan

1. Modify Dockerfile to install Gemini CLI and ensure `/home/appuser/.gemini` can be persisted/mounted.
2. Update documentation describing Docker vs. bare-metal Gemini setup.
3. Decide whether startup should fail when Gemini is default but CLI missing.
4. Re-build docker image, run verification checklist end-to-end to confirm Gemini availability.

## Next Steps

1. Review this RCA document.
2. Run `/implement-fix Gemini CLI warning when following verification checklist` (or equivalent issue ID) to apply the fix.
3. Run `/commit` after implementation is complete.

## Resolution

- `Dockerfile` now installs `@google/gemini-cli@0.21.0`, ensures `/usr/local/bin` is always on `PATH`, and prepares `/home/appuser/.gemini` so auth can be mounted/persisted for `appuser`.
- `src/index.ts` exits immediately with an actionable error when `DEFAULT_AI_ASSISTANT=gemini` or any registered codebase requires Gemini but the CLI is unreachable (`GEMINI_CLI_PATH` overrides included).
- Documentation updates (README, `docs/assistants/gemini.md`, the full verification checklist) explain that Docker images include the CLI, illustrate how to run `docker compose exec app gemini login`, and document the `/home/appuser/.gemini` volume mount so authentication survives container rebuilds.
