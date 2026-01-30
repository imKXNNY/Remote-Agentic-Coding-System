# System Review: WebUI vs. Core Remote-Agentic Features

## Overview
This report analyzes the functional parity between the newly implemented Svelte WebUI and the existing stable adapters (Telegram, GitHub). It identifies critical process gaps and technical debt observed during the initial development cycle.

## Comparative Analysis

### 1. Functional Parity Matrix

| Feature | Telegram/GitHub (Stable) | WebUI (Current) | Gap / Risk |
|---------|-------------------------|-----------------|------------|
| **Slash Commands** | Full support (/clone, /help, etc) | partial (manual input only) | /clone and /setcwd are not integrated into UI |
| **Streaming** | Stream (TG) / Batch (GH) | Stream supported | Handshake fragility (fixed in v1.1) |
| **Context** | Issue/PR metadata injection | Zero context injection | WebUI lacks "Connect to Issue" feature |
| **Commands** | Recursive load from `.md` | Visible in logs only | No UI button to trigger /command-invoke |
| **File Access** | AI-only via tools | AI tools + Explorer | **WebUI Advantage**: Visual feedback |

### 2. Process Gaps & Friction

- **Discovery Gap**: The implementation plan originally missed the SQL constraint mismatch in the `conversations` API, leading to a 500 error during the first integration test.
- **Protocol Fragility**: The decision to use WebSocket subprotocols for authentication was technically sound but physically brittle due to RFC character restrictions (Base64 padding).
- **Docker Path Mismatch**: Development was done assuming local paths (`./workspace`), while production (Docker) strictly uses `/workspace`.

## Proposed Improvements

### 1. Unified Context Injection
**Rule Update**: `.agent/rules/00-core.md`
> [!IMPORTANT]
> All new conversation-starting UIs must allow passing an optional `ContextID` (Issue/PR) to the orchestrator to ensure AI alignment with existing tickets.

### 2. UI-Native Command Palette
Instead of typing `/command-invoke`, the WebUI should parse the `codebase.commands` JSON and render a "Workflow" sidebar. This prevents syntax errors and makes the system usable by non-power users.

### 3. Path Normalization Utility
Implement a `getNormalizedPath()` function in `src/utils` that intelligently switches between Docker and Local environments, removing hardcoded strings from `index.ts`.

### 4. WebSocket Health Check
Add a `ping/pong` heartbeat to `websocket.ts`. Currently, if the server restarts (e.g., during `docker compose up`), the UI badge might lag or show misleading "Connected" states until a packet is sent.

## Automation Opportunities
- **Lint Hook**: Add a Prettier/ESLint hook to ensure Svelte components follow the "glassmorphism" design tokens defined in `app.css`.
- **Sync Script**: Enhance `npm run sync:types` to also verify DB schema matches the generated types.

---
**Report Generated**: 2026-01-30
**Analyzer**: Antigravity (AI Coding Assistant)
