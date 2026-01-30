# System Review: WebUI Adapter Implementation

**Date:** 2026-01-29
**Target:** [Implementation Plan](file:///C:/Users/kenny/.gemini/antigravity/brain/36c6fb01-ad6c-40b7-92a3-1d25582545b1/implementation_plan.md)

## 1. Analysis

| Category | Rating | Observations |
|----------|:------:|--------------|
| **Plan Quality** | 🟡 | Acceptance criteria are improved, but the **Frontend Framework** decision is still ambiguous (Plan says React, Recommendation says Svelte). This is a blocking definition gap. |
| **Risk Assessment** | 🟠 | **API Contract Drift**: separating Backend (Node) and Frontend (SPA) without shared types invites bugs. **Security**: The plan implies exposing `0.0.0.0` via Docker but mentions no authentication. |
| **Validation** | 🟢 | Validation steps are concrete and manual checklist is good. One gap: No automated test for WebSocket reconnection. |
| **Work Slicing** | 🟢 | Phasing is logical (Backend → Frontend → Integration). |

## 2. Identified Process Gaps

### 🚫 Ambiguous Decision: React vs Svelte
The plan currently defaults to `React + Vite`, but the "Build vs Customize" analysis recommended `Svelte`.
**Risk**: Starting implementation with the wrong stack or changing mid-flight.
**Fix**: Explicitly confirm framework before starting Phase 2.

### ⚠️ Type Safety Disconnect
The Backend defines `MessageChunk` and `IPlatformAdapter` in `src/types`. The Frontend needs these exact types to parse WebSocket messages correctly.
**Risk**: Manual copy-pasting leads to out-of-sync types and runtime errors.
**Fix**: Create a "Shared Types" strategy.

### 🔒 Security Model Undefined
The "Remote Agent" implies potentially accessing this over the internet (via ngrok/tunnel mentioned in README).
**Risk**: If `webui` exposes file system access without auth, and a user tunnels port 3000, they expose their entire filesystem to the web.
**Fix**: Explicitly define the security model (e.g., "Localhost Only" or "Token Required").

### ♻️ Logic Duplication
`tool-formatter.ts` exists in backend to parse tools. Frontend needs to display them nicely.
**Risk**: Duplicating parsing logic in JS/TS on frontend.
**Fix**: Isolate shared logic into a module importable by both (or copy script).

---

## 3. Concrete Improvements (Action Items)

### 1) Automate Shared Types & Utils
**Action**: Add a `prebuild` script to sync core types/utils to frontend.
```json
// package.json
"scripts": {
  "sync:types": "copyfiles -f src/types/index.ts webui/src/types/",
  "sync:utils": "copyfiles -f src/utils/tool-formatter.ts webui/src/utils/"
}
```
*Why: Single source of truth for API contracts and tool parsing.*

### 2) Enforce "Localhost Only" or Add Auth
**Action**: Bind the HTTP server to `127.0.0.1` by default, OR implement a simple token check (reusing `GH_TOKEN` or `TELEGRAM_TOKEN` as a login password).
*Recommendation: For MVP, bind 0.0.0.0 but add Basic Auth middleware using a password from `.env`.*

### 3) Add WebSocket Heartbeat
**Action**: Add explicit "Ping/Pong" logic to the implementation plan.
*Why: Browsers and Docker networks often drop idle WS connections silently.*

### 4) Lazy Load Monaco Editor
**Action**: Ensure `Preview.tsx` lazy loads the Monaco editor component.
*Why: Monaco is 2-3MB+. Loading it on initial bundle slows down the app significantly.*

### 5) Update Plan with Svelte Decision
**Action**: If Svelte is chosen (per recommendation), update `implementation_plan.md` to reflect `svelte-kit` or `vite-plugin-svelte` setup instead of React.

---

## 4. Workflows Updates
*No changes to `.agent/workflows` needed yet.*
