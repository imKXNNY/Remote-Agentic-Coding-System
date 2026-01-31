# Root Cause Analysis: WebSocket Connection Loop & UI Clarity

## 🔍 Observed Issues
1. **WebSocket Stuck in "Connecting"**: The connection indicator remains yellow ("connecting") and never reaches "connected".
2. **Confusing Session Labels**: The chat header shows "telegram - 11:58:00", which the user misinterpreted as a clock or a bug because it doesn't match the current time (04:00 AM).

---

## 🛠️ Root Cause Analysis

### 1. WebSocket "Connecting" Loop
- **Diagnosis**: The frontend uses a subprotocol trick for authentication (`['authorization', b64_creds]`) because browsers do not support custom headers in the standard `WebSocket` API.
- **Root Cause**: In `src/index.ts`, the `WebSocketServer` is initialized without a `handleProtocols` callback. While the server manually extracts the credentials in the `connection` event, it never explicitly "picks" the `authorization` subprotocol during the initial HTTP Upgrade handshake. 
- **Impact**: Modern browsers (Chrome, Firefox, etc.) require that if a client requests specific subprotocols, the server MUST respond with one of them in the `Sec-WebSocket-Protocol` header. If the server response is empty, the browser immediately terminates the connection for security/spec compliance. This triggers the frontend's reconnection logic, creating an infinite "connecting" loop.

### 2. Session Label Clarity
- **Diagnosis**: The label displays `{conv.platform} - {toLocaleTimeString()}`.
- **Root Cause**: This is currently pulling the `updated_at` field from the database. It correctly identifies the last time a message was sent in that conversation, but without a "Last active" prefix, it looks like a buggy clock or a stale status.
- **Impact**: User confusion regarding whether the system is "live" or looking at old data.

---

## 🚀 Proposed Fixes

### 1. WebSocket Backend Fix ([index.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/src/index.ts))
- Implement `handleProtocols` in the `WebSocketServer` constructor to explicitly accept the `authorization` subprotocol.
- This ensures the browser receives the correct handshake response.

### 2. UI Label Improvement ([Chat.svelte](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/components/Chat.svelte))
- Update the dropdown label to explicitly say `Last active: [Time]`.
- Add a "New Chat" indicator if the list is empty.

### 3. Reconnection Visibility ([websocket.ts](file:///d:/VSCode%20Projects/Personal%20Projects/Remote-Agentic-Coding-System/webui/src/lib/websocket.ts))
- Add a slight delay to reconnection and log attempts to the console to help future debugging.

---

## ✅ Verification Plan
- **Pre-fix**: Observe the loop and subprotocol error in browser devtools (Network tab -> WS -> Headers).
- **Post-fix**: Verify the connection turns green ("connected") and the session labels show "Last active".
