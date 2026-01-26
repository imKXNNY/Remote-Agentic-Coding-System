# Adding Platform Adapters

Guide for implementing new platform adapters to connect messaging platforms to the Remote Coding Agent.

## IPlatformAdapter Interface

**Location:** `src/types/index.ts:49-74`

```typescript
export interface IPlatformAdapter {
  sendMessage(conversationId: string, message: string): Promise<void>;
  getStreamingMode(): 'stream' | 'batch';
  getPlatformType(): string;
  start(): Promise<void>;
  stop(): void;
}
```

## Implementation Steps

### 1. Create Adapter File

**Location:** `src/adapters/your-platform.ts`

```typescript
export class YourPlatformAdapter implements IPlatformAdapter {
  private streamingMode: 'stream' | 'batch';

  constructor(config: any, mode: 'stream' | 'batch' = 'stream') {
    this.streamingMode = mode;
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    // Handle message length limits, split if needed
    // See telegram.ts:28-55 for splitting pattern
  }

  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  getPlatformType(): string {
    return 'your-platform';
  }

  async start(): Promise<void> {
    // Start polling or webhook server
  }

  stop(): void {
    // Cleanup
  }
}
```

### 2. Register in Main App

**Location:** `src/index.ts`

```typescript
const token = process.env.YOUR_PLATFORM_TOKEN;
const mode = (process.env.YOUR_PLATFORM_STREAMING_MODE || 'stream') as 'stream' | 'batch';

if (token) {
  const adapter = new YourPlatformAdapter(token, mode);
  adapter.onMessage(async (conversationId, message) => {
    // Use lock manager to prevent concurrent processing
    lockManager.acquireLock(conversationId, async () => {
      await handleMessage(adapter, conversationId, message);
    });
  });
  await adapter.start();
}
```

**Concurrency control:** Use `ConversationLockManager` to prevent race conditions when multiple messages arrive simultaneously for the same conversation. Reference: `src/index.ts:54-57`

### 3. Add Environment Variables

```env
YOUR_PLATFORM_TOKEN=<token>
YOUR_PLATFORM_STREAMING_MODE=stream  # stream | batch
```

## Key Implementation Details

### Conversation ID Format

Each platform must provide a unique, stable conversation ID:
- **Telegram**: `chat_id` (e.g., `"123456789"`)
- **GitHub**: `owner/repo#issue_number` (e.g., `"user/repo#42"`)
- **Slack**: `thread_ts` or `channel_id+thread_ts`

### Message Length Limits

Handle platform-specific limits by splitting long messages line-by-line. Reference: `src/adapters/telegram.ts:28-55`

### Polling Pattern

For platforms that support polling (Telegram, Discord):

```typescript
async start(): Promise<void> {
  this.bot.on('message', async (ctx) => {
    const conversationId = this.getConversationId(ctx);
    const message = ctx.message.text;
    await this.onMessageHandler(conversationId, message);
  });

  await this.bot.launch({ dropPendingUpdates: true });
}
```

**Reference:** `src/adapters/telegram.ts:89-106`

### Webhook Pattern

For platforms that require webhooks (GitHub, Slack):

**Step 1:** Add Express route in `src/index.ts`:

```typescript
app.post('/webhooks/your-platform', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature'] as string;
  const payload = req.body.toString();

  try {
    await adapter.handleWebhook(payload, signature);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});
```

**Step 2:** Implement webhook handler with signature verification:

```typescript
async handleWebhook(payload: string, signature: string): Promise<void> {
  // 1. Verify HMAC signature
  // 2. Parse event and extract conversationId + message
  // 3. Check for trigger (e.g., @mention)
  // 4. Route to orchestrator
}
```

**Reference:** `src/adapters/github.ts:378-491`

## Common Patterns

### Codebase Requirement

**All messages require a codebase** (not just `/command-invoke`):

```typescript
// In orchestrator
if (!conversation.codebase_id) {
  await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
  return;
}
```

**Reference:** `src/orchestrator/orchestrator.ts:102-107`

## Testing Checklist

- [ ] Test `sendMessage()` with short and long messages
- [ ] Verify `getConversationId()` returns stable IDs
- [ ] Test polling/webhooks receiving messages
- [ ] Test with stream and batch modes
- [ ] Test session persistence across restarts

## Reference Implementations

- **Telegram (polling)**: `src/adapters/telegram.ts`
- **GitHub (webhooks)**: `src/adapters/github.ts`
- **Test (HTTP endpoints)**: `src/adapters/test.ts`
