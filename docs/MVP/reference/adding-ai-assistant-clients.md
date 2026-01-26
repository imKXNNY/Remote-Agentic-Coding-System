# Adding AI Assistant Clients

Guide for implementing new AI assistant clients to connect AI SDKs to the Remote Coding Agent.

## IAssistantClient Interface

**Location:** `src/types/index.ts:93-106`

```typescript
export interface IAssistantClient {
  sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk>;

  getType(): string;
}
```

## MessageChunk Types

**Location:** `src/types/index.ts:79-87`

```typescript
interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;       // Text content
  sessionId?: string;     // Session ID for result type
  toolName?: string;      // Tool name for tool type
  toolInput?: Record<string, unknown>; // Tool parameters
}
```

- **`assistant`**: Text responses (shown to user)
- **`result`**: Session ID at end (stored in database)
- **`system`**: System messages/errors
- **`tool`**: Tool execution (formatted in stream mode)
- **`thinking`**: AI reasoning (optional)

## Implementation Steps

### 1. Create Client File

**Location:** `src/clients/your-assistant.ts`

```typescript
export class YourAssistantClient implements IAssistantClient {
  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk> {
    // Initialize or resume session
    let session;
    if (resumeSessionId) {
      session = await this.resumeSession(resumeSessionId, cwd);
    } else {
      session = await this.startSession(cwd);
    }

    try {
      // Stream responses and map to MessageChunk types
      for await (const event of this.sdk.streamQuery(session, prompt)) {
        if (event.type === 'text_response') {
          yield { type: 'assistant', content: event.text };
        } else if (event.type === 'tool_call') {
          yield { type: 'tool', toolName: event.tool, toolInput: event.parameters };
        } else if (event.type === 'thinking') {
          yield { type: 'thinking', content: event.reasoning };
        }
      }

      // Yield session ID for persistence
      yield { type: 'result', sessionId: session.id };
    } catch (error) {
      console.error('[YourAssistant] Query error:', error);
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  getType(): string {
    return 'your-assistant';
  }
}
```

### 2. Register in Factory

**Location:** `src/clients/factory.ts`

```typescript
export function getAssistantClient(type: string): IAssistantClient {
  switch (type) {
    case 'claude':
      return new ClaudeClient();
    case 'codex':
      return new CodexClient();
    case 'your-assistant':
      return new YourAssistantClient();
    default:
      throw new Error(`Unknown assistant type: ${type}`);
  }
}
```

### 3. Add Environment Variables

```env
YOUR_ASSISTANT_API_KEY=<key>
YOUR_ASSISTANT_MODEL=<model-name>
```

## Session Management

**Key concepts:**
- Store `assistant_session_id` in database to resume context
- New session only on plan→execute transition
- All other commands resume existing active session

**Orchestrator handles session lifecycle** (`src/orchestrator/orchestrator.ts:122-145`):

```typescript
// Check for plan→execute transition (requires NEW session)
const needsNewSession =
  commandName === 'execute' &&
  session?.metadata?.lastCommand === 'plan-feature';

if (needsNewSession) {
  await sessionDb.deactivateSession(session.id);
  session = await sessionDb.createSession({...});
} else if (!session) {
  session = await sessionDb.createSession({...});
} else {
  // Resume existing session
}
```

## Streaming Event Mapping

Map SDK-specific events to `MessageChunk` types:

**Claude Code SDK pattern:** `src/clients/claude.ts:74-99`
- `msg.type === 'assistant'` → Process content blocks (text, tool_use)
- `msg.type === 'result'` → Extract session ID

**Codex SDK pattern:** `src/clients/codex.ts:88-148`
- `event.type === 'item.completed'` → Map item types (agent_message, command_execution, reasoning)
- `event.type === 'turn.completed'` → **Break event loop** (critical!)

## Error Handling

```typescript
// Wrap SDK calls
try {
  for await (const event of this.sdk.streamQuery(...)) {
    yield mapEventToChunk(event);
  }
} catch (error) {
  console.error('[YourAssistant] Query error:', error);
  throw error;
}

// Handle SDK errors gracefully
if (event.type === 'error') {
  console.error('[YourAssistant] Stream error:', event.message);
  // Only yield user-facing errors
  if (!event.message.includes('internal')) {
    yield { type: 'system', content: `⚠️ ${event.message}` };
  }
  continue;
}

// Session resume fallback
if (resumeSessionId) {
  try {
    session = await this.sdk.resumeSession(resumeSessionId, { cwd });
  } catch (error) {
    console.error(`Failed to resume ${resumeSessionId}, creating new`);
    session = await this.sdk.createSession({ cwd });
  }
}
```

## Configuration

**Environment variables:**

```typescript
constructor() {
  this.apiKey = process.env.YOUR_ASSISTANT_API_KEY || '';
  this.model = process.env.YOUR_ASSISTANT_MODEL || 'default-model';

  if (!this.apiKey) {
    throw new Error('YOUR_ASSISTANT_API_KEY is required');
  }
}
```

**Working directory:** Always pass `cwd` to SDK session creation.

**Permission modes:** For SDKs requiring tool approval, use `permissionMode: 'bypassPermissions'` (reference: `src/clients/claude.ts:38`).

## Testing Checklist

- [ ] Test session creation and resumption
- [ ] Test plan→execute transition (new session created)
- [ ] Test all MessageChunk types map correctly
- [ ] Test with stream and batch modes
- [ ] Test error handling (network errors, API errors)
- [ ] Test session persistence across container restarts
- [ ] Verify session IDs stored in database

## Common Patterns

**Dynamic import for ESM packages:**

```typescript
const importDynamic = new Function('modulePath', 'return import(modulePath)');
const { YourSDK } = await importDynamic('@your/sdk');
```

**Reference:** `src/clients/codex.ts:18-35`

## Reference Implementations

- **Claude Code SDK**: `src/clients/claude.ts`
- **Codex SDK**: `src/clients/codex.ts`
- **Factory**: `src/clients/factory.ts`
