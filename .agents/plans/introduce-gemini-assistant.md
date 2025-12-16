# Feature: Gemini Assistant Integration

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Add first-class support for Google's Gemini coding assistant so conversations can run through the local Gemini CLI (stream-json output with code-execution tools) using the same workflows (prime → plan → execute) as existing Claude/Codex clients. Implementation must include a new `GeminiClient`, environment validation for the CLI binary/auth, auto-detection of `.gemini/commands` folders during `/clone` and GitHub webhook flows, plus documentation describing credential setup and limitations.

## User Story

As a remote coding agent user who already relies on Gemini locally  
I want to select Gemini per codebase/conversation  
So that I can reuse my Gemini setup without changing established remote-agent workflows

## Problem Statement

Current system only instantiates Claude or Codex clients via `getAssistantClient`. Repo detection, docs, and env templates mention only those assistants, so codebases containing Gemini workflows cannot be configured. Without a Gemini client there is no way to stream responses or persist session history, and `/clone` has no heuristics to suggest Gemini automatically.

## Solution Statement

Introduce a new TypeScript client that shells out to the Gemini CLI (YOLO mode, `--output-format stream-json`) and translates CLI events into our `MessageChunk` format, including a resilient prompt hand-off that tolerates YAML front-matter and other `--`-prefixed text. Extend detection logic to recognize `.gemini/commands`, update startup validation and docs for CLI env vars (`GEMINI_CLI_PATH`, `GEMINI_CLI_ARGS`, auth notes), and add tests/validation instructions to ensure the new assistant behaves consistently with existing abstractions.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `src/clients`, orchestrator session persistence, command handler (/clone), GitHub adapter auto-detection, docs/env templates  
**Dependencies**: Gemini CLI binary/auth (installed in Docker image), optional env overrides (`GEMINI_CLI_PATH`, `GEMINI_CLI_ARGS`)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/types/index.ts:5-106` – Interfaces for `Conversation`, `Session`, `IAssistantClient`, and `MessageChunk` the Gemini client must align with.  
- `src/clients/claude.ts:1-112` – Streaming/async-generator pattern to mirror (chunk handling, stderr logging).  
- `src/clients/codex.ts:1-161` – Example of translating provider-specific events into `MessageChunk`s and persisting `sessionId`.  
- `src/clients/factory.ts:1-27` – Central switch used by orchestrator; needs new Gemini branch.  
- `src/orchestrator/orchestrator.ts:16-233` – Session lifecycle, plan→execute reset logic, and streaming-mode handling that consumes new client.  
- `src/handlers/command-handler.ts:166-275` – `/clone` logic auto-detecting `.codex`/`.claude` and recommending commands; must expand for `.gemini/commands`.  
- `src/adapters/github.ts:240-309` – Repo cloning + `autoDetectAndLoadCommands` currently scanning only `.claude/.agents`; expand to `.gemini`.  
- `README.md:130-330` (AI assistant setup section) – Document requirements for Gemini credentials.  
- `.env.example:15-40` – Reference for adding new env vars and helpful comments.

### New Files to Create

- `src/clients/gemini.ts` – Implements `IAssistantClient` by spawning the Gemini CLI, parsing stream-json lines, and persisting CLI session IDs.  
- `src/clients/gemini.test.ts` – Unit tests for prompt/arg piping helpers (mock spawn + event parsing).  
- `docs/assistants/gemini.md` – Focused setup instructions for the CLI, auth persistence, troubleshooting, rate-limit notes.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Gemini CLI README](https://github.com/google-gemini/gemini-cli)  
  - Requirements (Node.js ≥20, auth via `gemini login`, YOLO/approval flags, mounting `~/.gemini`). Why: ensures runtime compatibility + environment instructions.  
- [Gemini CLI stream-json output schema](https://github.com/google-gemini/gemini-cli#stream-json-output)  
  - Demonstrates event structure (`init`, `message`, `tool_use`, `tool_result`, `error`, `result`). Why: guides streaming implementation + chunk iteration.  
- `.agents/reference/adding-ai-assistant-clients.md`  
  - Internal guidelines for `IAssistantClient` implementations, session persistence expectations, and error handling patterns.

### Patterns to Follow

- **Async Generator Streaming** (`src/clients/claude.ts:74-103`): yield `assistant`, `tool`, `result` chunks inside `for await` loop.  
- **Session Metadata** (`src/orchestrator/orchestrator.ts:116-134`): when `commandName === 'execute'` after `plan-feature`, deactivate prior session; new client must provide deterministic session IDs.  
- **Command Detection** (`src/handlers/command-handler.ts:214-268`): sequential folder checks to pick assistant type and suggest command directories. Extend with `.gemini/commands`.  
- **Command Auto-loading** (`src/adapters/github.ts:254-279`): loops through candidate folders to register commands; add `.gemini/commands`.  
- **Env Validation** (`src/index.ts:30-44`): log missing assistant credentials as warnings; exit only if none configured.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

Prepare CLI dependencies, configuration, and documentation placeholders for Gemini support.

**Tasks:**

- Ensure Docker image installs `@google/gemini-cli` (already done) and surface optional `GEMINI_CLI_PATH`/`GEMINI_CLI_ARGS` env vars in `.env.example`.  
- Draft `docs/assistants/gemini.md` covering CLI install/login, mounting `/home/appuser/.gemini`, YOLO/code-execution options, and smoke tests.  
- Update README AI assistant setup section with Gemini CLI prerequisites and quickstart steps.  
- Confirm CLAUDE.md references Gemini CLI as a supported assistant.

### Phase 2: Core Implementation

Build Gemini client with CLI process management and streaming integration.

**Tasks:**

- Implement `src/clients/gemini.ts` that:  
  - Validates CLI availability and fails fast with actionable error messages.  
  - Pipes prompts via stdin (protecting against YAML front-matter) while appending `--output-format stream-json --yolo` arguments and custom `GEMINI_CLI_ARGS`.  
  - Parses stdout line-by-line, mapping CLI events (`message`, `tool_use`, `tool_result`, `error`, `result`) into `MessageChunk`s, and captures CLI session IDs for persistence.  
  - Emits helpful `[Gemini CLI]` stderr logs and throws when the CLI exits non-zero (surface exit code + snippet).  
- Add helper tests (`src/clients/gemini.test.ts`) verifying stdin piping, event parsing, and error propagation (mock spawn/readline).

### Phase 3: Integration

Wire Gemini into the broader platform.

**Tasks:**

- Update `src/clients/factory.ts` to include `case 'gemini': return new GeminiClient();` and clarify error message listing supported assistants.  
- Extend `/clone` detection in `src/handlers/command-handler.ts` to look for `.gemini` markers and include `.gemini/commands` suggestions in the success message.  
- Modify `src/adapters/github.ts` auto-detection to register `.gemini/commands` and set default assistant to Gemini when `.gemini` folder exists.  
- Enhance startup validation in `src/index.ts` to warn when Gemini CLI binary/auth missing but assistant selected by default; ensure app exits if `DEFAULT_AI_ASSISTANT=gemini` while CLI unavailable or if DB contains Gemini codebases.

### Phase 4: Testing & Validation

Verify correctness through automated and manual tests.

**Tasks:**

- Extend Jest suite to cover:  
  - Gemini client stdin piping / stream-json parsing.  
  - `/clone` detection for `.gemini/commands`.  
  - GitHub adapter command auto-loading updated list.  
- Document manual validation steps:  
  - Run `gemini login` inside container or host, `/clone` repo containing `.gemini/commands`, invoke `/command-invoke plan`, confirm streaming + tool logs (especially with prompts starting `---`).  
  - Trigger GitHub webhook payload referencing such repo and verify logs show Gemini assistant selection.  
- Run full `npm run type-check`, `npm run lint`, `npm run test`, and CLI smoke test `gemini --output-format stream-json --prompt "Gemini CLI smoke test" | head`.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE docs/assistants/gemini.md

- **IMPLEMENT**: Describe prerequisites (Node 20+, install/login to `@google/gemini-cli`, mounting `~/.gemini` if running in containers), how to configure `GEMINI_CLI_PATH`/`GEMINI_CLI_ARGS`, enabling YOLO/code execution, and validating via `gemini --output-format stream-json --prompt "Gemini CLI smoke test" | head`.  
- **PATTERN**: Mirror depth of other assistant docs (e.g., CLAUDE.md sections).  
- **GOTCHA**: Call out quota/latency differences vs Claude/Codex.  
- **VALIDATE**: `cat docs/assistants/gemini.md`

### UPDATE README.md

- **IMPLEMENT**: Add Gemini subsection under AI Assistant setup, including env var table (CLI path/args, auth dir), installation steps (`npm install -g @google/gemini-cli`, `gemini login`), and a quick validation command using `gemini --output-format stream-json --prompt "..."`. Mention Docker volume mount for `/home/appuser/.gemini`.  
- **IMPORTS**: None (markdown).  
- **GOTCHA**: Keep table formatting consistent; remind readers to protect CLI auth tokens (mounted `.gemini` directory).  
- **VALIDATE**: `npm run lint` (ensures markdown-linked references ok via ESLint markdown plugin)

### UPDATE .env.example

- **IMPLEMENT**: Add `GEMINI_CLI_PATH` (optional), `GEMINI_CLI_ARGS` (optional comma-separated flags), and guidance for `DEFAULT_AI_ASSISTANT=gemini`. Remove obsolete API-key-only placeholders since CLI manages auth.  
- **VALIDATE**: `git diff .env.example` (manual review)

### UPDATE package.json

- **IMPLEMENT**: Ensure no unused Gemini API dependencies linger (we rely on the CLI binary). If `@google/generative-ai` was added previously, remove it. Update scripts/docs references if they point to API samples.  
- **VALIDATE**: `npm install && npm run lint`

### CREATE src/clients/gemini.ts

- **IMPLEMENT**:  
  - Validate CLI availability (`spawnSync(binary, ['--version'])`) in constructor; throw descriptive error if missing (especially when `DEFAULT_AI_ASSISTANT=gemini`).  
  - Build CLI args array: always include `--output-format`, `--yolo` (or `--approval-mode=yolo`), append `GEMINI_CLI_ARGS`.  
  - Pipe prompt text through stdin (or `--prompt=-`) to avoid misinterpreting YAML `---`/`--flag` sequences; cover plan file front-matter case seen in logs.  
  - Spawn CLI with proper `cwd`, capture stdout as line-delimited JSON, and map each event to `MessageChunk` (`assistant`, `tool`, `system`, `result`).  
  - Watch stderr for warnings and surface them as `[Gemini CLI]` logs; on non-zero exit code include stderr snippet in thrown Error so orchestrator can notify the user.  
- **IMPORTS**: `child_process.spawn`, `readline`, `IAssistantClient`, `MessageChunk`.  
- **GOTCHA**: Some CLI events (e.g., `tool_result`) arrive after `result`; buffer sessionId from `init` event. Ensure process cleanup in error paths.  
- **VALIDATE**: `npm run type-check`

### CREATE src/clients/gemini.test.ts

- **IMPLEMENT**: Jest tests mocking `child_process.spawn` to simulate stream-json events. Cover cases:  
  - Prompt text starting with `---` still reaches stdin (no CLI parse failure).  
  - CLI emitting `tool_use` / `tool_result` events becomes `tool` chunks.  
  - Non-zero exit rejects with stderr snippet.  
- **VALIDATE**: `npm run test -- src/clients/gemini.test.ts`

### UPDATE src/clients/factory.ts

- **IMPLEMENT**: Import `GeminiClient`, add switch case `'gemini'`. Update default error message to include `'gemini'`.  
- **VALIDATE**: `npm run lint`

### UPDATE src/handlers/command-handler.ts

- **IMPLEMENT**:  
  - Extend `/clone` detection to check for `.gemini` folder (similar to `.codex`).  
  - Include `.gemini/commands` in command-folder search (`['.claude/commands', '.gemini/commands', '.agents/commands']`).  
  - Update user-facing message to mention `.gemini/commands`.  
- **PATTERN**: Keep sequential try/catch detection pattern.  
- **VALIDATE**: `npm run test -- src/handlers/command-handler.test.ts`

### UPDATE src/adapters/github.ts

- **IMPLEMENT**:  
  - During repo initialization, if `.gemini` folder detected, set suggested assistant to `'gemini'`.  
  - Expand `autoDetectAndLoadCommands` folder list to include `.gemini/commands`.  
- **VALIDATE**: `npm run lint`

### UPDATE src/index.ts

- **IMPLEMENT**: Enhance credential validation to check if the Gemini CLI binary is runnable. Warn when missing, but **fail fast** if `DEFAULT_AI_ASSISTANT=gemini` or if DB contains Gemini codebases (similar to Codex/Claude checks). Log clear remediation steps (install CLI, set `GEMINI_CLI_PATH`).  
- **VALIDATE**: `npm run type-check`

### UPDATE CLAUDE.md (optional but recommended)

- **IMPLEMENT**: Mention Gemini assistant availability and reference new docs file.  
- **VALIDATE**: `npm run lint`

---

## TESTING STRATEGY

### Unit Tests

- `src/clients/gemini.test.ts`: mock spawn/readline to ensure stdin piping of prompts, stream-json parsing, tool/result chunk emission, and error propagation.  
- Extend `src/handlers/command-handler.test.ts` to cover `.gemini/commands` detection message.  
- Add lightweight test for factory default error when `gemini` unsupported env.

### Integration Tests

- Manual-only due to external tooling: run `/command-invoke plan` against a Gemini-configured repo after `gemini login`, confirm streaming/tool logs and that prompts starting with `---` no longer crash the CLI.  
- GitHub webhook dry-run: use existing webhook simulator to trigger `.gemini/commands` repo and verify logs showing command load + assistant selection.

### Edge Cases

- Missing CLI binary -> ensure startup warns and blocks Gemini-only conversations.  
- Prompt text beginning with YAML front matter or `--` flags -> ensure stdin piping prevents CLI parse errors (regression test).  
- CLI quota/permission errors mid-stream -> ensure client yields `system` warning chunk then throws.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

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

### Level 3: Integration Tests

```bash
# Requires gemini CLI installed + gemini login run inside container/host
curl -X POST http://localhost:3000/test/message \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"gemini-smoke","message":"/command-invoke plan \"---\nSmoke test\""}'
```

### Level 4: Manual Validation

1. `/clone` repo containing `.gemini/commands` and ensure success message suggests loading those commands.  
2. Run `/command-invoke plan "Gemini test"` and verify streaming output + tool call logs.  
3. Trigger GitHub webhook for same repo and confirm `.gemini/commands` auto-loaded.

---

## ACCEPTANCE CRITERIA

- [ ] `GeminiClient` streams assistant/tool/result chunks from the CLI, safely handles stdin prompts, and persists session IDs.  
- [ ] `/clone` + GitHub workflows detect `.gemini/commands` and set assistant type accordingly.  
- [ ] README, CLAUDE.md, and docs explain Gemini setup + env vars.  
- [ ] `.env.example` lists new variables with guidance.  
- [ ] Factory + orchestrator handle Gemini without regressions.  
- [ ] Validation commands pass, including unit tests.  
- [ ] Manual smoke test after `gemini login` succeeds.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order.  
- [ ] Each task validated immediately.  
- [ ] Validation commands run (type-check, lint, format:check, test, manual curl).  
- [ ] README/docs updated.  
- [ ] Gemini assistant accessible via `/clone` and GitHub flows.  
- [ ] Acceptance criteria satisfied.

---

## NOTES

- Gemini CLI sessions output UUIDs in `init` events—store those in `assistant_session_id`; keep metadata small.  
- Code execution via CLI may incur latency; include warning in docs.  
- If CLI binary/auth unavailable in certain environments, ensure logs clearly indicate Gemini disabled so ops can troubleshoot quickly (especially if repo defaults to Gemini).  
- Consider future follow-up plan for Qwen once Gemini integration patterns validated.
