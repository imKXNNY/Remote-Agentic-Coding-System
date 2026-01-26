# Streaming Modes

Guide to streaming modes for AI response delivery.

## Overview

Streaming modes control how AI responses are delivered: **real-time (stream)** or **accumulated (batch)**.

## Configuration

### Environment Variables

```env
TELEGRAM_STREAMING_MODE=stream  # Default: stream
GITHUB_STREAMING_MODE=batch     # Default: batch
SLACK_STREAMING_MODE=stream     # Default: stream
```

### Platform Implementation

```typescript
export class YourPlatformAdapter implements IPlatformAdapter {
  private streamingMode: 'stream' | 'batch';

  constructor(config: any, mode: 'stream' | 'batch' = 'stream') {
    this.streamingMode = mode;
  }

  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }
}
```

## Mode Comparison

| Mode | Behavior | Pros | Cons | Best For |
|------|----------|------|------|----------|
| **stream** | Send each chunk immediately | Real-time feedback, see progress | Many API calls | Chat platforms (Telegram, Slack) |
| **batch** | Accumulate chunks, send final summary | Single message, no spam | No progress indication | Issue trackers (GitHub) |

## Implementation

**Location:** `src/orchestrator/orchestrator.ts:148-228`

### Stream Mode

```typescript
if (mode === 'stream') {
  for await (const msg of aiClient.sendQuery(prompt, cwd, sessionId)) {
    if (msg.type === 'assistant' && msg.content) {
      await platform.sendMessage(conversationId, msg.content);
    } else if (msg.type === 'tool' && msg.toolName) {
      const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
      await platform.sendMessage(conversationId, toolMessage);
    } else if (msg.type === 'result' && msg.sessionId) {
      await sessionDb.updateSession(session.id, msg.sessionId);
    }
  }
}
```

**What gets sent:**
- Assistant messages (AI text responses)
- Tool calls (formatted with emoji: `🔧 BASH\ngit status`)
- Thinking (optional, AI reasoning)

**Tool call formatting** (`src/utils/tool-formatter.ts`):

```typescript
export function formatToolCall(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  let message = `🔧 ${toolName.toUpperCase()}`;

  if (toolName === 'Bash' && toolInput?.command) {
    message += `\n${toolInput.command}`;
  } else if (toolName === 'Read' && toolInput?.file_path) {
    message += `\nReading: ${toolInput.file_path}`;
  } else if (toolName === 'Edit' && toolInput?.file_path) {
    message += `\nEditing: ${toolInput.file_path}`;
  }

  return message;
}
```

### Batch Mode

```typescript
if (mode === 'batch') {
  const assistantMessages: string[] = [];

  for await (const msg of aiClient.sendQuery(prompt, cwd, sessionId)) {
    if (msg.type === 'assistant' && msg.content) {
      assistantMessages.push(msg.content);
    } else if (msg.type === 'tool' && msg.toolName) {
      console.log(`[Orchestrator] Tool call: ${msg.toolName}`);
    } else if (msg.type === 'result' && msg.sessionId) {
      await sessionDb.updateSession(session.id, msg.sessionId);
    }
  }

  // Extract clean summary (remove tool indicators)
  const finalMessage = extractCleanSummary(assistantMessages);
  await platform.sendMessage(conversationId, finalMessage);
}
```

**Clean summary extraction:**

Removes tool indicators from final message:
- 🔧 (tool call), 💭 (thinking), 📝 (note), ✏️ (edit), etc.

Filters out sections starting with emojis, sends only clean summary text.

**Reference:** `src/orchestrator/orchestrator.ts:197-222`

## Platform-Specific Defaults

- **Telegram**: `stream` (real-time chat experience)
- **GitHub**: `batch` (avoid comment spam)
- **Slack**: `stream` (real-time updates engaging)

## Testing

**Test stream mode:**
1. Set `YOUR_PLATFORM_STREAMING_MODE=stream`
2. Send `/command-invoke prime`
3. Verify messages arrive separately in real-time

**Test batch mode:**
1. Set `YOUR_PLATFORM_STREAMING_MODE=batch`
2. Send `/command-invoke prime`
3. Verify single final message with no tool indicators

## Performance Considerations

**Stream mode:**
- More API calls (one per chunk)
- Users see progress immediately
- Monitor for rate limits

**Batch mode:**
- Single API call
- Users wait longer with no progress indication
- For long operations, consider hybrid: send "Working..." at start, then final result

## Reference Files

- **Orchestrator**: `src/orchestrator/orchestrator.ts:148-228`
- **Tool Formatter**: `src/utils/tool-formatter.ts`
- **Telegram Adapter**: `src/adapters/telegram.ts`
- **GitHub Adapter**: `src/adapters/github.ts:89-91`
