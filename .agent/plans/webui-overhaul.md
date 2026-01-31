# WebUI Adapter Implementation Plan

Add a browser-based interface to replace Telegram for local development. This adapter integrates with the existing orchestrator via `IPlatformAdapter` interface and provides file browsing, preview, and real-time streaming via WebSocket.

---

## Success Metrics (Definition of Done)

| Metric | Target | How to Validate |
|--------|--------|-----------------|
| **WebSocket streaming** | Messages appear within 100ms of AI generation | Console timestamp comparison |
| **File tree browsing** | Lists all files in `workspaces/` recursively | API returns expected file count |
| **Code preview** | Syntax highlighting for 5+ languages | Visual check (TS, JS, JSON, MD, CSS) |
| **Session persistence** | Conversation survives browser refresh | Reload and verify history |
| **Security** | Auth required for access | Curl returns 401 without creds |
| **Type Safety** | Shared types synced | `npm run sync:types` succeeds |
| **Unit test coverage** | ≥80% for new adapter code | `npm test -- --coverage` |
| **Build success** | Docker builds without errors | `docker compose build` exits 0 |

---

## Acceptance Criteria (Must Pass Before PR)

### Phase 1: Backend & Security
- [ ] `WebUIAdapter` implements all `IPlatformAdapter` methods
- [ ] WebSocket endpoint `/ws` requires authentication
- [ ] Basic Auth middleware protects all `/api/*` routes
- [ ] `sync:types` script copies `src/types` to `webui/src/types`
- [ ] `GET /api/files` returns directory listing as JSON
- [ ] `GET /api/conversations` returns list from PostgreSQL
- [ ] `POST /api/conversations/:id/message` triggers orchestrator

### Phase 2: Frontend (Svelte)
- [ ] SPA loads at `http://localhost:3000` (dev) or Docker (prod)
- [ ] Login screen appears if unauthenticated
- [ ] Chat input sends message via WebSocket
- [ ] AI responses stream in real-time (no page refresh)
- [ ] Tool calls display with 🔧 indicator
- [ ] File tree shows `workspaces/` contents
- [ ] Clicking file opens preview (Monaco for code, rendered for MD)
- [ ] Svelte components use shared types from backend

### Phase 3: Integration
- [ ] All unit tests pass (`npm test`)
- [ ] Docker build succeeds (`docker compose --profile external-db build`)
- [ ] Production container serves frontend correctly
- [ ] README updated with WebUI usage instructions

---

## Proposed Changes

### Backend: WebUI Adapter

#### [NEW] [webui.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/src/adapters/webui.ts)

```typescript
export class WebUIAdapter implements IPlatformAdapter {
  // IPlatformAdapter implementation
  sendMessage(conversationId: string, message: string): Promise<void>
  getStreamingMode(): 'stream' | 'batch'  // Always 'stream'
  getPlatformType(): string               // Returns 'webui'
  start(): Promise<void>
  stop(): void
  
  // WebSocket-specific
  handleConnection(ws: WebSocket, req: IncomingMessage): void
  broadcastToConversation(conversationId: string, event: WebUIEvent): void
}
```

#### [MODIFY] [index.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/src/index.ts)

- Add `basicAuthMiddleware` using `WEBUI_USER` / `WEBUI_PASSWORD` from env (defaulting to safe random if unset)
- Add WebSocket server on `/ws` with auth handshake
- Add file API endpoints (`/api/files/*`)
- Add conversation API endpoints (`/api/conversations/*`)
- Serve frontend static files from `webui/dist`

#### [MODIFY] [package.json](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/package.json)

- Add `sync:types` script: `copyfiles -f src/types/index.ts webui/src/types/`
- Add `copyfiles` devDependency

#### [NEW] [webui.test.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/src/adapters/webui.test.ts)

Unit tests for adapter methods, WebSocket handling, and auth rejection.

---

### Frontend: Svelte + Vite SPA

#### [NEW] webui/ directory

```
webui/
├── package.json
├── vite.config.ts
├── svelte.config.js
├── src/
│   ├── App.svelte
│   ├── components/
│   │   ├── Chat.svelte
│   │   ├── FileTree.svelte
│   │   ├── Preview.svelte
│   │   └── Login.svelte
│   ├── lib/
│   │   ├── websocket.ts
│   │   └── api.ts
│   ├── types/
│   │   └── index.ts         # Synced from backend
│   └── app.css
```

**Dependencies:** `svelte`, `vite`, `svelte-monaco-editor` (or similar wrapper), `marked` (markdown)

---

### Docker Integration

#### [MODIFY] [Dockerfile](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/Dockerfile)

Add multi-stage build for frontend using `npm run build` (Svelte).

---

## Verification Plan

### Automated Tests

```bash
# Run all tests including WebUI adapter
npm test

# Check coverage (target ≥80%)
npm test -- --coverage --collectCoverageFrom="src/adapters/webui.ts"
```

### Manual Browser Testing Checklist

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `http://localhost:3000` | **Login screen appears** (401) |
| 2 | Enter credentials | Redirect to main UI |
| 3 | Type message, press Enter | Message appears in chat |
| 4 | Wait for AI response | Response streams in real-time |
| 5 | Check for tool calls | 🔧 indicators visible |
| 6 | Click `.ts` file in tree | Monaco editor opens |
| 7 | Click `.md` file | Markdown renders formatted |
| 8 | Refresh browser | **No login needed** (session), history visible |
| 9 | Send message via Telegram | Telegram conversation stays separate |

### Docker Validation

```bash
# Build
docker compose --profile external-db build

# Run
docker compose --profile external-db up -d

# Test frontend requires auth
curl -I http://localhost:3000/api/conversations
# Expected: 401 Unauthorized
```

---

## Risks / Mitigations

| Risk | Mitigation |
|------|------------|
| WebSocket drops | Reconnect with exponential backoff + auth re-handshake |
| Type drift | `npm run sync:types` runs before build |
| Auth bypass | Middleware applied globally to `/api` and `/ws` upgrade |
| Large files | Limit preview to <1MB |

---

---

## Phase 5: UI/UX Redesign

**Goal**: Transform the basic UI into a premium, developer-centric environment.

### Proposed UI Changes

#### [MODIFY] [app.css](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/app.css)
- Centralize colors: Hubzilla Blue (`#0e639c`), deep dark grays, and high-contrast text.
- Add utility classes for glassmorphism and smooth transitions.

#### [MODIFY] [App.svelte](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/App.svelte)
- Implement `100dvh` layout with `overflow: hidden`.
- Improve sidebar-to-preview transitions.

#### [MODIFY] [Chat.svelte](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/components/Chat.svelte)
- Better message grouping and bubbles.
- Modern scrollbars and input area.

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Backend adapter + Auth | 4-6 hours |
| Frontend SPA (Svelte) | 6-10 hours |
| Integration + Sync | 2-4 hours |
| Testing + Docs | 2-4 hours |
| **UI/UX Overhaul** | **4-6 hours** |
| **Total** | **~3-4 days** |

---

## Phase 8: Connectivity & Explorer Fixes (High Priority)

**Goal**: Fix the persistent "Connecting" badge and show files in the Explorer.

### Proposed Changes

#### [MODIFY] [index.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/src/index.ts)
- **Fix "Connecting" status**: Update `authMiddleware` to ignore requests starting with `/ws`. The WebSocket handshake will be handled separately by the WS server's subprotocol logic.
- **Fix Explorer**: Update `/api/files` to prioritize `/workspace` if it exists, ensuring it works inside Docker regardless of `./workspace` relative path confusion.
- **Handshake Logging**: Add granular logging to the `handleProtocols` and `connection` handlers to assist future debugging.

#### [MODIFY] [Chat.svelte](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/components/Chat.svelte)
- Add reconnection retry logic if connection is lost after handshake.

## Phase 9: Chat Persistence (Optional/Future)
- (Moved from Phase 8 as per user request to prioritize core experience)
- Create `remote_agent_messages` table and implement fetch API.

