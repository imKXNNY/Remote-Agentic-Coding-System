# Issue #13 - WebUI Feature Parity Audit and Missing Entrypoints

Issue: `#13`  
Repo: `imKXNNY/Remote-Agentic-Coding-System`  
Date: 2026-02-02

## Goal

Close the gap between backend capabilities and WebUI entrypoints for high-value workflows:
- command workflows
- model and sandbox controls
- session controls
- context linking
- observability/stats

## Current State Audit

| Area | Backend Capability | Current WebUI Entrypoint | Status | Gap |
|---|---|---|---|---|
| Command invoke | `/command-invoke <name>` in orchestrator | `CommandPalette.svelte` supports click-to-invoke | Partial | No argument UI, no grouped workflows, no validation |
| Command discovery | `/api/conversations/:id/commands` | Command palette loads and renders | OK | Missing metadata (phase/type) for UX grouping |
| Codebase switch | Conversation update via `/setcwd`, `/clone` | `ContextSelector.svelte` emits `/set-codebase <id>` | Broken | `/set-codebase` command does not exist in `command-handler.ts` |
| CWD switch | `/setcwd <path>` | Manual typing only | Missing | No path picker or quick-select from repo defaults |
| Session reset | `/reset` | Manual typing only | Missing | No one-click reset control |
| Bootstrap | `/bootstrap [force]` | Manual typing only | Missing | No explicit provisioning control/button |
| Model selection | `/setmodel <id>` | Manual typing only | Missing | No model dropdown/input in WebUI |
| Sandbox selection | `/setsandbox <mode>` | Manual typing only | Missing | No sandbox selector in WebUI |
| Additional dirs | `/codex-add-dir`, `/codex-clear-dirs` | Only shows existing dirs and clear-all button | Partial | No add-dir input UI |
| Stats/telemetry | `/api/stats` endpoint | No visible stats panel | Missing | No UI for latency/success telemetry |
| Issue linking | GitHub route `/api/github/issues` available | Context selector shows issue picker | Partial | Selection sends plain text, not structured context command |
| Message rendering | Streamed text + tool messages | `Chat.svelte` renders plain content | Partial | Markdown/code formatting is tracked separately in issue #12 |

## Priority Plan (Implementation Slices)

### Slice P0 - Fix broken and high-impact entrypoints
1. Fix codebase switching:
   - Option A: implement `/set-codebase <id>` command in `src/handlers/command-handler.ts`.
   - Option B: change UI to emit valid existing commands (`/setcwd <default_cwd>`).
   - Recommendation: Option A (cleaner API contract for UI).
2. Add session control buttons in WebUI:
   - `Reset Session` -> sends `/reset`
   - `Bootstrap` -> sends `/bootstrap`
3. Add explicit status chip:
   - active codebase, cwd, assistant type, sandbox mode.

Files:
- `src/handlers/command-handler.ts`
- `webui/src/components/ContextSelector.svelte`
- `webui/src/components/Chat.svelte`

Acceptance checks:
- Selecting a codebase no longer returns "Unknown command".
- Reset and bootstrap can be triggered without typing slash commands.
- Status reflects backend conversation/codebase values.

### Slice P1 - Model/sandbox/additional-dir controls
1. Add model picker UI:
   - predefined model list + free text fallback.
   - sends `/setmodel <id>`.
2. Add sandbox selector UI:
   - read-only, workspace-write, danger-full-access.
   - sends `/setsandbox <mode>`.
3. Add additional directory UI:
   - input path + add button -> `/codex-add-dir <path>`.
   - keep existing clear-all behavior.

Files:
- `webui/src/components/ContextSelector.svelte`
- `webui/src/components/CommandPalette.svelte` (optional quick actions section)
- `webui/src/lib/api.ts` (if extra fetch helpers are added)

Acceptance checks:
- Model and sandbox can be set from UI and persist in `/status`.
- Additional directories can be added/cleared from UI without manual command typing.

### Slice P2 - Context linking and observability
1. Normalize issue linking flow:
   - create deterministic command or API-backed structured context action.
   - avoid plain-text context injection.
2. Add telemetry panel:
   - consume `/api/stats` and show key metrics (latency, success/error counts).
3. Improve command UX:
   - group commands (core workflow, maintenance, codex utilities).
   - support argument prompts for common commands.

Files:
- `src/handlers/command-handler.ts` (if adding context command)
- `src/orchestrator/orchestrator.ts` (if structured context handling is added)
- `webui/src/components/ContextSelector.svelte`
- `webui/src/components/CommandPalette.svelte`
- `webui/src/components/Chat.svelte` (or new `StatsPanel.svelte`)

Acceptance checks:
- Issue linking produces deterministic, parseable context behavior.
- Stats visible and refreshable in WebUI.
- Users can run common workflows without memorizing slash syntax.

## Non-Goals for Issue #13

- Full markdown rendering polish in chat output (tracked by issue #12).
- Large layout/responsive redesign (tracked by issue #11).

## Suggested Execution Order

1. P0 (stability and broken entrypoint fix)
2. P1 (core productivity controls)
3. P2 (quality-of-life and observability)

## Verification Checklist

- `npm run type-check`
- `npm run lint`
- `npm test`
- Manual WebUI validation:
  - codebase switch works
  - reset/bootstrap buttons work
  - model/sandbox controls work
  - add-dir and clear-dir work
  - issue link flow is deterministic
  - stats panel renders data from `/api/stats`
