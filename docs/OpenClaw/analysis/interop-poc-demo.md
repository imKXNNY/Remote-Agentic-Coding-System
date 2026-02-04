# OpenClaw Interop PoC Demo (Issue #26)

Date: 2026-02-04
Endpoint: `POST /webhooks/openclaw/bridge`
Event class: `openclaw.bridge.command`
Supported command(s): `/status`

## Request Contract
Headers:
- `Content-Type: application/json`
- `x-openclaw-shared-secret: <OPENCLAW_BRIDGE_SHARED_SECRET>`

Body:
```json
{
  "eventId": "evt-2026-02-04-0001",
  "conversationId": "openclaw:thread:demo-1",
  "repositoryFullName": "imKXNNY/Remote-Agentic-Coding-System",
  "targetBranch": "stable",
  "command": "/status"
}
```

## Happy Path Demo
```bash
curl -X POST http://localhost:3000/webhooks/openclaw/bridge \
  -H "Content-Type: application/json" \
  -H "x-openclaw-shared-secret: $OPENCLAW_BRIDGE_SHARED_SECRET" \
  -d '{
    "eventId":"evt-2026-02-04-0001",
    "conversationId":"openclaw:thread:demo-1",
    "repositoryFullName":"imKXNNY/Remote-Agentic-Coding-System",
    "targetBranch":"stable",
    "command":"/status"
  }'
```

Expected response shape:
- `status: "executed"`
- `eventId` echoed
- `runId`, `chainId` included for audit linkage
- `result` includes loop-health summary and recent run snapshot

## Negative Safety Demo (command allowlist)
```bash
curl -X POST http://localhost:3000/webhooks/openclaw/bridge \
  -H "Content-Type: application/json" \
  -H "x-openclaw-shared-secret: $OPENCLAW_BRIDGE_SHARED_SECRET" \
  -d '{
    "eventId":"evt-2026-02-04-0002",
    "conversationId":"openclaw:thread:demo-2",
    "repositoryFullName":"imKXNNY/Remote-Agentic-Coding-System",
    "command":"/execute"
  }'
```

Expected response shape:
- `status: "blocked_policy"`
- `reason: "command_not_allowed"`
- `runId`, `chainId` present
- `allowedCommands` includes only allowlisted command(s)

## Replay/Idempotency Demo
Repeat an event with the same `eventId` and context:
- expected status: `deduped` or `already_processing`
- expected: same `runId` linkage returned by control-plane dedupe path
