# Feature: Gemini Assistant Integration

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Add first-class support for Google's Gemini coding assistant so conversations can run through Gemini's streaming API with code-execution capability, same workflows (prime → plan → execute) as existing Claude/Codex clients. Implementation must include a new `GeminiClient`, environment validation, auto-detection of `.gemini/commands` folders during `/clone` and GitHub webhook flows, plus documentation describing credential setup and limitations.

## User Story

As a remote coding agent user who already relies on Gemini locally  
I want to select Gemini per codebase/conversation  
So that I can reuse my Gemini setup without changing established remote-agent workflows

## Problem Statement

Current system only instantiates Claude or Codex clients via `getAssistantClient`. Repo detection, docs, and env templates mention only those assistants, so codebases containing Gemini workflows cannot be configured. Without a Gemini client there is no way to stream responses or persist session history, and `/clone` has no heuristics to suggest Gemini automatically.

## Solution Statement

Introduce a new TypeScript client wrapping `@google/generative-ai` streaming APIs with history serialization stored in `assistant_session_id`, extend detection logic to recognize `.gemini/commands`, update startup validation and docs for new env vars (`GEMINI_API_KEY`, `GEMINI_MODEL`), and add tests/validation instructions to ensure the new assistant behaves consistently with existing abstractions.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `src/clients`, orchestrator session persistence, command handler (/clone), GitHub adapter auto-detection, docs/env templates  
**Dependencies**: `@google/generative-ai` npm package, user-provided `GEMINI_API_KEY`

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

- `src/clients/gemini.ts` – Implements `IAssistantClient` using `@google/generative-ai` streaming API with code-execution tool support.  
- `src/clients/gemini.test.ts` – Unit tests for history serialization/deserialization helpers (mock SDK).  
- `docs/assistants/gemini.md` – Focused setup instructions, troubleshooting, rate-limit notes.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Google Generative AI Samples README](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/README.md)  
  - Requirements (Node.js ≥18, `API_KEY` env var). Why: ensures runtime compatibility + environment instructions.  
- [Chat Streaming Sample](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/chat.js)  
  - Demonstrates `startChat` and `sendMessageStream`. Why: guides streaming implementation + chunk iteration.  
- [Code Execution Sample](https://github.com/google-gemini/deprecated-generative-ai-js/blob/main/samples/code_execution.js)  
  - Shows enabling `tools: [{ codeExecution: {} }]`. Why: necessary to let Gemini run shell/code similar to other assistants.  
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

Prepare dependencies, configuration, and documentation placeholders for Gemini support.

**Tasks:**

- Add `@google/generative-ai` dependency and ensure TypeScript configuration handles its types.  
- Introduce new environment variables (`GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GEMINI_CODE_EXECUTION=true|false`) in `.env.example` with descriptive comments.  
- Draft `docs/assistants/gemini.md` covering API key retrieval, verifying `node chat.js`, and warning about quota/latency.  
- Update README AI assistant setup section with Gemini prerequisites and quickstart steps.

### Phase 2: Core Implementation

Build Gemini client with history persistence and streaming integration.

**Tasks:**

- Implement `src/clients/gemini.ts` that:  
  - Imports `GoogleGenerativeAI`, validates env vars in constructor.  
  - Encodes chat history (array of Gemini `Content` objects) into JSON stored in `assistant_session_id`.  
  - Enables code execution via `tools: [{ codeExecution: {} }]` when creating the model.  
  - Handles `sendMessageStream`, yielding `MessageChunk`s for assistant text and logging tool events (Gemini surfaces `functionCall`/`codeExecution` via structured responses).  
  - Gracefully handles API errors (yield `system` warning for recoverable quota errors, throw otherwise).  
- Add helper tests (`src/clients/gemini.test.ts`) verifying serialization/truncation logic without hitting the API (mock the SDK module).

### Phase 3: Integration

Wire Gemini into the broader platform.

**Tasks:**

- Update `src/clients/factory.ts` to include `case 'gemini': return new GeminiClient();` and clarify error message listing supported assistants.  
- Extend `/clone` detection in `src/handlers/command-handler.ts` to look for `.gemini` markers and include `.gemini/commands` suggestions in the success message.  
- Modify `src/adapters/github.ts` auto-detection to register `.gemini/commands` and set default assistant to Gemini when `.gemini` folder exists.  
- Enhance startup validation in `src/index.ts` to warn when Gemini env vars missing but assistant selected by default; ensure app exits if `DEFAULT_AI_ASSISTANT=gemini` while credentials absent.

### Phase 4: Testing & Validation

Verify correctness through automated and manual tests.

**Tasks:**

- Extend Jest suite to cover:  
  - Gemini client history helpers.  
  - `/clone` detection for `.gemini/commands`.  
  - GitHub adapter command auto-loading updated list.  
- Document manual validation steps:  
  - Set `GEMINI_API_KEY`, run `/clone` on repo containing `.gemini/commands`, invoke `/command-invoke plan`, confirm streaming.  
  - Trigger GitHub webhook payload referencing such repo and verify logs show Gemini assistant selection.  
- Run full `npm run type-check`, `npm run lint`, `npm run test`, and smoke test `node` script verifying `@google/generative-ai` import.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE docs/assistants/gemini.md

- **IMPLEMENT**: Describe prerequisites (Node 18+, `npm install @google/generative-ai` already handled), how to obtain `GEMINI_API_KEY`, enabling code execution, validating via sample script.  
- **PATTERN**: Mirror depth of other assistant docs (e.g., CLAUDE.md sections).  
- **GOTCHA**: Call out quota/latency differences vs Claude/Codex.  
- **VALIDATE**: `cat docs/assistants/gemini.md`

### UPDATE README.md

- **IMPLEMENT**: Add Gemini subsection under AI Assistant setup, including env var table, installation steps, and quick validation command (`node samples/chat.js`).  
- **IMPORTS**: None (markdown).  
- **GOTCHA**: Keep table formatting consistent; mention security of API key.  
- **VALIDATE**: `npm run lint` (ensures markdown-linked references ok via ESLint markdown plugin)

### UPDATE .env.example

- **IMPLEMENT**: Add `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-1.5-flash`, `GEMINI_ENABLE_CODE_EXECUTION=true` with clear comments grouped under AI assistants.  
- **VALIDATE**: `git diff .env.example` (manual review)

### UPDATE package.json

- **IMPLEMENT**: Add `@google/generative-ai` to dependencies; keep alphabetical order.  
- **VALIDATE**: `npm install && npm run lint`

### CREATE src/clients/gemini.ts

- **IMPLEMENT**:  
  - Validate env vars in constructor; throw descriptive error if missing.  
  - Provide helper to parse/serialize chat history (JSON string stored in session).  
  - Use `GoogleGenerativeAI` to `startChat({ history, tools: codeExecution? })`, call `sendMessageStream(prompt)`.  
  - `for await` each chunk: emit `assistant` chunk for `chunk.text()`, log/emit `tool` chunk when `chunk.candidates?.[0]?.content?.parts` contain `codeExecution` output, and after stream completion yield `result` chunk containing new serialized history.  
  - Catch API errors, log `[Gemini]` prefix, rethrow for orchestrator to handle.  
- **IMPORTS**: `GoogleGenerativeAI`, local `IAssistantClient`, `MessageChunk`.  
- **GOTCHA**: Limit stored history (e.g., last 10 exchanges) to keep session string manageable.  
- **VALIDATE**: `npm run type-check`

### CREATE src/clients/gemini.test.ts

- **IMPLEMENT**: Jest tests mocking serialization helpers, ensuring truncated history and error cases handled. Use jest.mock to stub `@google/generative-ai`.  
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

- **IMPLEMENT**: Enhance credential validation to check if Gemini env vars exist; warn when missing but `DEFAULT_AI_ASSISTANT=gemini` or a codebase uses it. Document log messages similar to existing ones.  
- **VALIDATE**: `npm run type-check`

### UPDATE CLAUDE.md (optional but recommended)

- **IMPLEMENT**: Mention Gemini assistant availability and reference new docs file.  
- **VALIDATE**: `npm run lint`

---

## TESTING STRATEGY

### Unit Tests

- `src/clients/gemini.test.ts`: serialization/resume logic, ensures truncated history and session strings.  
- Extend `src/handlers/command-handler.test.ts` to cover `.gemini/commands` detection message.  
- Add lightweight test for factory default error when `gemini` unsupported env.

### Integration Tests

- Manual-only due to external API: run `/command-invoke plan` against Gemini-configured repo with `GEMINI_API_KEY` set, confirm streaming and tool-invocation logs.  
- GitHub webhook dry-run: use existing webhook simulator to trigger `.gemini/commands` repo and verify logs showing command load + assistant selection.

### Edge Cases

- Missing/invalid API key -> ensure constructor throws and startup logs warn; orchestrator should surface friendly error.  
- Oversized chat history -> verify truncation to avoid DB bloat.  
- Gemini API quota errors mid-stream -> ensure client yields `system` warning chunk then throws.

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
# Requires GEMINI_API_KEY set
curl -X POST http://localhost:3000/test/message \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"gemini-smoke","message":"/command-invoke plan \"Test Gemini\""}'
```

### Level 4: Manual Validation

1. `/clone` repo containing `.gemini/commands` and ensure success message suggests loading those commands.  
2. Run `/command-invoke plan "Gemini test"` and verify streaming output + tool call logs.  
3. Trigger GitHub webhook for same repo and confirm `.gemini/commands` auto-loaded.

---

## ACCEPTANCE CRITERIA

- [ ] `GeminiClient` streams assistant/tool/result chunks and persists history.  
- [ ] `/clone` + GitHub workflows detect `.gemini/commands` and set assistant type accordingly.  
- [ ] README, CLAUDE.md, and docs explain Gemini setup + env vars.  
- [ ] `.env.example` lists new variables with guidance.  
- [ ] Factory + orchestrator handle Gemini without regressions.  
- [ ] Validation commands pass, including unit tests.  
- [ ] Manual smoke test with real Gemini API key succeeds.

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

- Gemini chat history stored in `assistant_session_id` must be bounded (e.g., store last 10 turns) to avoid oversized DB rows.  
- Code execution tool may incur latency; include warning in docs.  
- If API key unavailable in certain environments, ensure logs clearly indicate Gemini disabled so ops can troubleshoot quickly.  
- Consider future follow-up plan for Qwen once Gemini integration patterns validated.
