# Feature: Expand AI Assistant Catalog (Qwen + Gemini CLI)

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files etc.

## Feature Description

Broaden the remote coding agent so codebases can opt into additional CLI-driven AI assistants beyond Claude and Codex. The new capability should let users provision Qwen Agent (via qwen-agent with its code interpreter tooling) or Google's Gemini CLI/SDK with code execution enabled, select them per codebase, and keep the same orchestration/session semantics already in place for other assistants. The system must surface clear credential validation, auto-detect assistant preferences when cloning repos, and treat new assistants as first-class citizens everywhere the existing `ai_assistant_type` flows.

## User Story

As a remote agent user working across heterogeneous AI toolchains
I want my conversations and codebases to leverage Qwen CLI or Gemini CLI in addition to Claude/Codex
So that I can pick the coding assistant that matches my subscription, tooling comfort, or project requirements without changing the rest of the workflow

## Problem Statement

Only Claude Code and Codex are usable today. Assistant detection, environment validation, and the client factory are all hardcoded to those two providers, so codebases containing `.qwen/commands` or `.gemini/commands` folders cannot opt into their native CLIs. There is no abstraction for CLI-backed assistants, no session persistence for SDKs that lack built-in thread IDs, and no documentation telling users which credentials/CLIs to install. This prevents teams already invested in Qwen Agent or Gemini from using the platform and makes future assistant additions brittle.

## Solution Statement

Introduce a metadata-driven assistant registry plus two new client implementations:
- **QwenClient**: spawns a bundled Python bridge (`scripts/assistants/qwen_bridge.py`) that wraps `qwen-agent` (with `code_interpreter` tool) and streams JSON events back into the orchestrator, persisting per-session subprocesses keyed by generated IDs.
- **GeminiClient**: uses `@google/generative-ai` to start chats with `codeExecution` tools and `sendMessageStream`, storing chat history JSON inside `assistant_session_id` to resume context.

Refactor clone/webhook flows to consult assistant metadata (detecting `.qwen` / `.gemini` folders and command directories), extend startup credential checks, update docs/.env, and add targeted tests so the platform can grow beyond two providers with minimal future changes.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High (new clients + cross-cutting plumbing)
**Primary Systems Affected**: `src/clients`, orchestrator, DB helpers, command handler, GitHub adapter, docs/configuration
**Dependencies**: `qwen-agent` (Python, installed by user), `DASHSCOPE_API_KEY` for DashScope or self-hosted Qwen, `@google/generative-ai` npm package + `GEMINI_API_KEY`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/types/index.ts:5-106` – Core `Conversation`, `Session`, and `IAssistantClient` definitions that new clients must satisfy.
- `src/clients/claude.ts:1-112` – Reference implementation for streaming, tool-event mapping, and stderr filtering.
- `src/clients/codex.ts:1-161` – Shows how thread/session IDs are persisted and how SDK-specific events map to `MessageChunk`s.
- `src/clients/factory.ts:1-27` – Central switch that instantiates assistant clients; must be generalized for new providers.
- `src/orchestrator/orchestrator.ts:16-235` – Conversation orchestration, session creation/resume, and streaming-mode branching.
- `src/index.ts:18-211` – Startup flow, credential validation, adapter initialization, and express server wiring.
- `src/db/codebases.ts:7-63` – `createCodebase` interface (currently defaults to `claude`) and command storage logic.
- `src/db/conversations.ts:7-69` – Conversation creation that inherits `ai_assistant_type` and enforces immutability.
- `src/db/sessions.ts:7-50` – Session persistence + metadata updates; will store Gemini chat history blobs.
- `src/handlers/command-handler.ts:166-275` – `/clone` logic that clones repos, detects `.codex`/`.claude`, and determines assistant + command folders.
- `src/adapters/github.ts:240-309` – Auto-clone/sync logic plus `autoDetectAndLoadCommands`; extend for new assistant folders and default types.
- `src/scripts/setup-auth.ts:1-96` – Pattern for assistant-specific credential bootstrap (Codex); informs how to message Qwen/Gemini setup instructions.
- `README.md` (AI Assistant Setup + usage sections) – Must be expanded with Qwen/Gemini install/credential steps.

### New Files to Create

- `src/config/assistants.ts` – Strongly typed registry describing each assistant (id, env vars, command folder markers, detection folders, display names).
- `src/clients/qwen.ts` – Implements `IAssistantClient` via a CLI bridge using `child_process.spawn` and JSON-over-stdio.
- `scripts/assistants/qwen_bridge.py` – Python shim that imports `qwen-agent`, instantiates an `Assistant` with `code_interpreter`, and emits structured events for the Node client.
- `src/clients/gemini.ts` – TypeScript client using `@google/generative-ai` streaming API with chat-history persistence.
- `src/utils/assistant-detection.ts` (optional helper) – Shared logic to detect assistants/command folders for `/clone` and GitHub adapter.
- `src/clients/__tests__/assistant-factory.test.ts` – Verifies new factory branches and metadata-driven validation without hitting real SDKs.
- `docs/assistants/qwen.md` & `docs/assistants/gemini.md` (or a combined doc) – Detailed setup instructions referenced from README.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Qwen-Agent README – Installation & Code Interpreter](https://github.com/QwenLM/Qwen-Agent/blob/main/README.md#installation)
  - Lines 40-80 detail `pip install -U "qwen-agent[gui,rag,code_interpreter,mcp]"` and the `DASHSCOPE_API_KEY` requirement.
  - Lines ~120-170 show creating an `Assistant` with `tools = ['my_image_gen', 'code_interpreter']`, confirming we can drive Qwen Agent with a Python shim and custom working directory.
- [Qwen-Agent README – MCP & Tool Usage](https://github.com/QwenLM/Qwen-Agent/blob/main/README.md#how-to-use-mcp)
  - Documents how to wire additional tools and prerequisites; informs how to expose local filesystem/workspace to the agent safely.
- [Google Generative AI Samples README](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/README.md)
  - Calls out Node.js ≥18, `API_KEY` env var, and runnable sample entry points (e.g., `node chat.js`).
- [Google Generative AI Chat Streaming Sample](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/chat.js)
  - Demonstrates `sendMessageStream` usage, chunk iteration, and `startChat` history injection.
- [Google Generative AI Code Execution Sample](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/code_execution.js)
  - Shows enabling `tools: [{ codeExecution: {} }]` when instantiating the model—critical so Gemini can execute code samples analogous to other assistants.
- `.agents/reference/adding-ai-assistant-clients.md`
  - Internal playbook covering `IAssistantClient` contract, event mapping, and session resume expectations.

### Patterns to Follow

- **Client Streaming Pattern**: Mirror `src/clients/claude.ts` and `src/clients/codex.ts`, yielding `MessageChunk`s for assistant text, tool calls, and result/session IDs.
- **Session Lifecycle**: Orchestrator logic (`src/orchestrator/orchestrator.ts:116-173`) enforces plan→execute new sessions and metadata tracking (`updateSessionMetadata`). Ensure new clients return deterministic `sessionId`s so this logic continues to work.
- **Command Detection**: `/clone` currently inspects `.codex` / `.claude` directories (`src/handlers/command-handler.ts:214-268`). Extend via shared helper rather than reinventing detection in new places.
- **Command Auto-Loading**: GitHub adapter uses a list of command folders (`src/adapters/github.ts:254-279`). Follow same pattern when adding `.qwen/commands`, `.gemini/commands`, etc.
- **Credential Validation Messaging**: `src/index.ts:30-44` logs warnings/errors for missing Claude/Codex creds. Follow that tone/structure for Qwen/Gemini so ops can diagnose misconfiguration quickly.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

Lay groundwork for supporting more assistants without scattering conditional logic.

**Tasks:**

- Introduce `src/config/assistants.ts` describing each assistant's id, human-readable name, env requirements, detection folders, command folder names, and startup validation helpers.
- Create shared detection utilities (e.g., `detectAssistantFromRepo`, `findCommandFolders`) consumed by `/clone` and GitHub adapter.
- Update `.env.example`, README, and docs outline with placeholder variables (`QWEN_CLI_PATH`, `QWEN_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`).
- Add `@google/generative-ai` to `package.json` dependencies; ensure TypeScript types compile.

### Phase 2: Core Implementation

Build the new assistant clients and supporting bridges.

**Tasks:**

- Implement `scripts/assistants/qwen_bridge.py`:
  - Reads newline-delimited JSON commands (`{"sessionId": null, "cwd": "...", "prompt": "..."}`), instantiates/looks up `Assistant` instances with `code_interpreter` pointing at the requested working directory, and streams JSON responses (`assistant`, `tool`, `result`).
  - Handles `DASHSCOPE_API_KEY`/model selection, logs to stderr for observability, and ensures stdout lines are flushed.
- Create `src/clients/qwen.ts`:
  - Spawns the bridge (from `process.env.QWEN_BRIDGE_PATH` or default path) via `child_process.spawn`, maintains a process pool keyed by session ID, and maps emitted JSON to `MessageChunk`s.
  - Handles process restarts, timeouts, and ensures tool events (like `code_interpreter` command invocations) become `tool` chunks for the orchestrator.
- Create `src/clients/gemini.ts`:
  - Uses `GoogleGenerativeAI` with `sendMessageStream` and `tools: [{ codeExecution: {} }]`, storing chat history (user + model messages) as a JSON string inside `assistant_session_id` so future calls can rebuild history.
  - Converts streaming chunks to `assistant` output and ensures final `result` chunk contains the updated serialized history.
- Extend `src/clients/factory.ts` to return new clients; consider throwing clearer errors when unsupported assistant ids are requested.

### Phase 3: Integration

Wire new assistants through detection, database defaults, startup validation, and docs.

**Tasks:**

- Update startup credential validation in `src/index.ts`:
  - Use assistant metadata to report which assistants are usable; log actionable messages for missing env vars/CLI binaries.
  - Ensure `DEFAULT_AI_ASSISTANT` rejects unsupported ids at boot.
- Update `/clone` in `src/handlers/command-handler.ts` to use detection helper:
  - Detect `.qwen` / `.gemini` marker directories (and optionally `.agents/qwen`, etc.).
  - Auto-suggest the correct assistant and include new command folder suggestions in the response.
- Modify `GitHubAdapter` clone + `autoDetectAndLoadCommands` to reuse detection helper for both assistant type and command directories so remote GH workflows also pick up Qwen/Gemini repos.
- Add README + `docs/assistants/*.md` explaining how to install Qwen Agent (pip extras, Python ≥3.10, `DASHSCOPE_API_KEY`) and how to obtain a Gemini API key + enable CLI/SDK.
- Update `.env.example` with new variables, plus mention bridging script path/CLI path.

### Phase 4: Testing & Validation

Ensure correctness with unit tests and manual flows.

**Tasks:**

- Add Jest tests for assistant metadata/detection (given mock repo directories, ensure correct assistant and command folders are returned).
- Add tests for the client factory to confirm Qwen/Gemini branches instantiate and throw when env is missing.
- Add serialization tests for `GeminiClient` history encoding/decoding (no actual API calls; mock the SDK).
- Document manual validation steps: running `/clone` on repos with `.qwen/commands`, verifying conversation stream with Qwen/Gemini, ensuring plan→execute session resets still work.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE src/config/assistants.ts

- **IMPLEMENT**: Define `AssistantDefinition` (id, displayName, detectionFolders, commandFolders, requiredEnv, optionalEnv, clientFactoryKey). Export `ASSISTANTS` map plus helpers: `isAssistantEnabled`, `resolveAssistantFromFolders`, `listSupportedAssistants`.
- **PATTERN**: Mirror enum-style exports found elsewhere (e.g., `src/types/index.ts` exports) for consistent typing.
- **IMPORTS**: Only built-in types (`fs/promises` not needed here). Export types for reuse by command handler and GitHub adapter.
- **GOTCHA**: Keep detection logic synchronous/pure; async FS operations happen in caller.
- **VALIDATE**: `npm run type-check`

### UPDATE package.json

- **IMPLEMENT**: Add `@google/generative-ai` dependency; optionally add script alias to run `python3 scripts/assistants/qwen_bridge.py --help` for docs.
- **PATTERN**: Maintain alphabetical ordering as in existing dependencies.
- **VALIDATE**: `npm install && npm run lint`

### CREATE scripts/assistants/qwen_bridge.py

- **IMPLEMENT**: Python script that:
  - Imports `qwen_agent` and configures an `Assistant` per session (dictionary keyed by UUID).
  - Accepts STDIN JSON commands specifying `sessionId`, `cwd`, `prompt`, `resume` flag.
  - Ensures `code_interpreter` uses provided `cwd` (set via environment or `assistant.set_workdir`).
  - Emits JSON lines for each chunk: `{"type": "assistant", "content": "..."}`, `{"type": "tool", "toolName": "bash", "toolInput": {...}}`, `{"type": "result", "sessionId": "session-uuid"}`.
  - Flushes after every write and exits cleanly on EOF.
- **PATTERN**: Follow CLI bridging best practices (structured logging to stderr, newline-delimited JSON to stdout).
- **GOTCHA**: Validate python version >= 3.10 and provide descriptive error if `qwen_agent` import fails.
- **VALIDATE**: `python3 scripts/assistants/qwen_bridge.py --self-test` (add optional flag that sends sample prompt without hitting DashScope)

### CREATE src/clients/qwen.ts

- **IMPLEMENT**: New `QwenClient` that spawns the bridge via `child_process.spawn`, writes request JSON per query, and reads newline-delimited responses using `readline`. Maintain `Map<string, ChildProcess>` to reuse sessions, kill processes on errors, and forward `stderr` to console. Map events to `MessageChunk`s; when bridge emits `result`, yield chunk with session ID.
- **PATTERN**: Use `spawn` + `readline` similar to how other projects wrap CLI tools; reuse logging style from `claude.ts` for info/warnings.
- **IMPORTS**: `child_process`, `readline`, `path`, `os`, `MessageChunk` type.
- **GOTCHA**: Guard against partial JSON lines by buffering; implement timeout/retry on process exit to avoid leaked sessions.
- **VALIDATE**: `npm run type-check`

### CREATE src/clients/gemini.ts

- **IMPLEMENT**: `GeminiClient` class that:
  - Reads `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-1.5-flash`), optional `GEMINI_ENABLE_CODE_EXECUTION`.
  - When `sendQuery` is called, rebuilds history from `resumeSessionId` JSON (decode string), constructs `startChat({ history, tools: [{ codeExecution: {} }] })`, invokes `sendMessageStream`, yields `assistant` chunks per `chunk.text()`, and after stream completion serializes updated history back as `sessionId` chunk.
  - Adds structured error handling for quota errors (yield `system` chunk when recoverable).
- **PATTERN**: Use streaming loops similar to `ClaudeClient` but adapted for `for await (const chunk of result.stream)`.
- **IMPORTS**: `GoogleGenerativeAI` from `@google/generative-ai` plus local types.
- **GOTCHA**: Manage history size (truncate array to avoid `assistant_session_id` overflow) and keep JSON base64-encoded if necessary.
- **VALIDATE**: `npm run type-check`

### UPDATE src/clients/factory.ts

- **IMPLEMENT**: Import new clients and extend switch (or convert to lookup map) for `'qwen'` and `'gemini'`. Use metadata to provide better error messages listing supported ids.
- **PATTERN**: Keep default branch throwing descriptive error.
- **VALIDATE**: `npm run lint`

### UPDATE src/index.ts

- **IMPLEMENT**: Replace hardcoded Claude/Codex env checks with metadata-driven validation: iterate through `ASSISTANTS`, call helper to determine if required env vars/CLI binaries are set, and log readiness summary. Ensure `DEFAULT_AI_ASSISTANT` is validated against registry.
- **PATTERN**: Use existing console logging style (clear `[App]` prefixes).
- **GOTCHA**: Exit early only if zero assistants enabled; warn (not exit) for missing optional ones.
- **VALIDATE**: `npm run type-check`

### UPDATE src/handlers/command-handler.ts

- **IMPLEMENT**: In `/clone`, replace manual `.codex`/`.claude` detection with helper from `assistant-detection`. Provide detection fallbacks prioritizing explicit markers (e.g., `.qwen` then `.codex`). Update command-folder discovery to include new assistant-specific directories defined in metadata. Update response copy to mention new folders (e.g., `.qwen/commands`).
- **PATTERN**: Keep existing logging/warning style; prefer `for..of` loops.
- **GOTCHA**: Maintain backwards compatibility for `.agents/commands` fallback.
- **VALIDATE**: `npm run test -- src/handlers/command-handler.test.ts`

### UPDATE src/adapters/github.ts

- **IMPLEMENT**: Use shared detection helper when creating new codebases to set `ai_assistant_type`. Extend `autoDetectAndLoadCommands` to iterate over metadata-driven `commandFolders` instead of hardcoded list.
- **PATTERN**: Use existing `for (const folder of ...)` style; keep logs consistent.
- **GOTCHA**: Ensure detection runs after repo sync completes; avoid duplicate DB updates.
- **VALIDATE**: `npm run lint`

### UPDATE README.md & docs

- **IMPLEMENT**: Add sections under "AI Assistant Setup" for Qwen and Gemini:
  - Qwen: prerequisites (Python ≥3.10, `pip install -U "qwen-agent[code_interpreter]"`), `DASHSCOPE_API_KEY`, configuring `QWEN_BRIDGE_PATH`, verifying CLI with `python3 scripts/assistants/qwen_bridge.py --self-test`.
  - Gemini: obtaining API key (`GEMINI_API_KEY`), enabling streaming/code execution, installing `@google/generative-ai`, mention rate limits.
- **PATTERN**: Follow existing README formatting (tables for env vars, bulleted steps).
- **GOTCHA**: Document security considerations (Python bridge runs local code -> caution about repo trust).
- **VALIDATE**: `npm run lint:markdown` if available, otherwise manual proofreading.

### UPDATE .env.example

- **IMPLEMENT**: Add new env vars (`QWEN_BRIDGE_PATH`, `QWEN_MODEL`, `DASHSCOPE_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, optional toggles). Provide comments describing usage.
- **VALIDATE**: `git diff .env.example` (manual review)

### ADD tests for assistant detection & clients

- **IMPLEMENT**: 
  - `src/utils/assistant-detection.test.ts`: mock FS structure and ensure helper returns expected assistant IDs and command folder lists.
  - `src/clients/__tests__/assistant-factory.test.ts`: mock env vars to assert factory instantiates Qwen/Gemini when enabled and throws otherwise.
  - `src/clients/__tests__/gemini-session.test.ts`: test serialization helpers without hitting API.
- **PATTERN**: Follow jest style in `src/handlers/command-handler.test.ts` (describe/test pairs).
- **GOTCHA**: Use dependency injection/mocking rather than spawning real processes.
- **VALIDATE**: `npm run test`

### UPDATE docs/assistants/*.md (new)

- **IMPLEMENT**: Detailed setup per assistant (install commands, verifying CLI, environment variables, troubleshooting). Link from README and CLAUDE.md.
- **VALIDATE**: Manual review / link check

---

## TESTING STRATEGY

### Unit Tests

- Assistant detection helper responds correctly for `.claude`, `.codex`, `.qwen`, `.gemini`, and fallback `.agents` (use temp directories or mocked FS modules).
- Factory instantiation: ensure unknown assistant id throws descriptive error; ensure supported ones instantiate when env indicates availability (mock `process.env`).
- Gemini history serialization/deserialization ensures prompts/responses are preserved and truncated to configured depth.

### Integration Tests

- CLI bridge smoke test (optional Jest test that spawns bridge with `--self-test` flag and asserts JSON structure) guarded by env so it can be skipped in CI if qwen-agent absent.
- Manual end-to-end check: run `/clone` on repo containing `.qwen/commands`, issue `/command-invoke` and confirm streaming, tool events, and session persistence.
- GitHub webhook simulation: ensure `.gemini/commands` repo auto-loads commands and selects Gemini assistant.

### Edge Cases

- Missing CLI or env variables: verify startup logs warn and conversations reject unsupported assistants gracefully.
- Session resume for Gemini when stored history can't parse (e.g., corrupted JSON) – should start fresh session rather than crashing.
- Qwen bridge process crash mid-stream – ensure Node client restarts session or surfaces error to user with `/reset` suggestion.
- Plan→execute transition still forces new sessions for all assistants.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
npm run type-check
npm run lint
npm run format:check
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

```bash
npm run test
```

### Level 3: Integration Tests

```bash
# Optional CLI bridge smoke test (skips if dependencies missing)
QWEN_SELF_TEST=1 npm run test -- src/clients/__tests__/qwen-bridge.test.ts
```

### Level 4: Manual Validation

1. `/clone` repo containing `.qwen/commands`; ensure response suggests `/load-commands .qwen/commands` and conversation streams via Qwen.
2. `/clone` repo containing `.gemini/commands`; confirm assistant auto-selects Gemini and plan→execute works.
3. For GitHub webhook, post payload referencing `.qwen/commands` repo and ensure assistant/command detection works in logs.

### Level 5: Additional Validation (Optional)

- Run `python3 scripts/assistants/qwen_bridge.py --self-test` to verify bridge dependencies.
- Use `node -e "require('@google/generative-ai')"` to ensure Gemini SDK is available.

---

## ACCEPTANCE CRITERIA

- [ ] `QwenClient` and `GeminiClient` implement `IAssistantClient` and stream responses/tool events correctly.
- [ ] Assistant registry + detection logic supports Claude, Codex, Qwen, Gemini uniformly.
- [ ] `/clone` and GitHub auto-detection set `ai_assistant_type` based on repo markers, including `.qwen/commands` and `.gemini/commands`.
- [ ] Startup logs accurately reflect which assistants are enabled (and why others are disabled).
- [ ] Docs and `.env.example` include concrete setup instructions for new assistants.
- [ ] Unit tests cover detection, factory behavior, and Gemini history serialization.
- [ ] Manual validation confirms conversations can stream via Qwen and Gemini without regressing Claude/Codex flows.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: type-check, lint, format:check
  - [ ] Level 2: test
  - [ ] Level 3: Gemini/Qwen integration smoke tests (if enabled)
  - [ ] Level 4: Manual script testing
  - [ ] Level 5: Config validation
- [ ] Full test suite passes (unit + integration)
- [ ] No linting errors (`npm run lint`)
- [ ] No formatting errors (`npm run format:check`)
- [ ] No type checking errors (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

- Qwen bridge security: running `code_interpreter` locally gives the assistant shell access. Document that repos must be trusted, consider sandboxing in future iteration.
- Gemini chat history can grow quickly; plan to cap stored turns (e.g., keep last 10 exchanges) to prevent bloated `assistant_session_id`.
- Future assistants can reuse metadata + detection helpers; ensure structures are generic enough (e.g., allow assistants that don't need command folders).

## QUALITY CRITERIA ✓

### Context Completeness ✓
- [x] Assistant registry + detection requirements captured
- [x] External library usage documented with links (Qwen Agent, Gemini SDK)
- [x] Integration points (clone, GitHub, orchestrator) mapped
- [x] Gotchas (CLI security, session storage) noted
- [x] Validation commands enumerated per task/level

### Implementation Ready ✓
- [x] Tasks ordered by dependency and atomic
- [x] Pattern references include file paths + line numbers
- [x] New files + tests explicitly listed
- [x] Foundation/core/integration phases clearly separated

### Pattern Consistency ✓
- [x] Plan aligns with `IAssistantClient` + streaming patterns
- [x] New helpers leverage existing architecture (DB, orchestrator)
- [x] Testing approach mirrors existing Jest usage

### Information Density ✓
- [x] Specific paths, env vars, and commands provided
- [x] URLs include targeted sections
- [x] No generic "update docs" directives without details

## SUCCESS METRICS

- One-pass implementation by execution agent with no further research.
- All validation commands pass on first run.
- Manual tests demonstrate Qwen + Gemini sessions behave like existing assistants.
- **Confidence Score**: 6/10 (new CLI bridge + session persistence introduce moderate uncertainty but mitigated via detailed plan and documentation references).

