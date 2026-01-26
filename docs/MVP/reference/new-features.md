# Creating New Features - Implementation Guide

Patterns and best practices for extending the Remote Agentic Coding Platform.

---

## Platform Adapters

Add support for new messaging platforms (Discord, WhatsApp, etc.).

### Interface

```typescript
interface IPlatformAdapter {
  receiveMessage(): Promise<{conversationId: string, message: string}>;
  sendMessage(conversationId: string, message: string): Promise<void>;
  getConversationId(event: any): string;
}
```

### Implementation Steps

1. Create file in `src/adapters/` (e.g., `discord.ts`)
2. Implement `IPlatformAdapter` interface
3. Handle authentication via environment variables
4. Configure SDK (polling) or webhook handler
5. Define conversation ID format (must uniquely identify message destination)

### Example: Telegram Adapter

```typescript
import { Telegraf } from 'telegraf';

export class TelegramAdapter implements IPlatformAdapter {
  private bot: Telegraf;

  constructor(token: string) {
    this.bot = new Telegraf(token);
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    await this.bot.telegram.sendMessage(conversationId, message);
  }

  getConversationId(event: any): string {
    return event.chat?.id?.toString() || '';
  }
}
```

### Conversation ID Formats

- **Telegram**: `chat_id` (e.g., `"12345"`)
- **Slack**: `thread_ts` (e.g., `"1234567890.123456"`)
- **GitHub**: `owner/repo#number` (e.g., `"user/repo#42"`)

### Authentication

Store credentials in `.env`:
```env
DISCORD_BOT_TOKEN=...
WHATSAPP_API_KEY=...
```

---

## AI Assistant Clients

Wrap AI SDKs (Claude, Codex, Gemini) with consistent interface.

### Interface

```typescript
interface IAssistantClient {
  startSession(cwd: string, systemPrompt: string): Promise<string>;
  resumeSession(sessionId: string): Promise<void>;
  sendMessage(message: string): Promise<void>;
  streamResponse(): AsyncIterator<MessageChunk>;
  endSession(): Promise<void>;
}

interface MessageChunk {
  type: 'text' | 'tool' | 'thinking';
  content: string;
  toolName?: string;
}
```

### Implementation Steps

1. Create file in `src/clients/` (e.g., `gemini.ts`)
2. Implement `IAssistantClient` interface
3. Handle session lifecycle (create, resume, end)
4. Implement streaming as async iterator
5. Add authentication via environment variables

### Streaming Pattern

```typescript
for await (const chunk of aiClient.streamResponse()) {
  if (chunk.type === 'text') {
    await platform.sendMessage(conversationId, chunk.content);
  } else if (chunk.type === 'tool') {
    await platform.sendMessage(conversationId, `🔧 ${chunk.toolName}`);
  }
  // Skip 'thinking' type
}
```

### Error Handling

```typescript
try {
  for await (const chunk of aiClient.streamResponse()) {
    await platform.sendMessage(conversationId, chunk.content);
  }
} catch (error) {
  console.error('[AI] Streaming error', { error, sessionId });
  await platform.sendMessage(conversationId, '❌ AI error. Try /reset');
}
```

---

## Slash Commands

Deterministic operations (no AI involvement). Pure database/file operations.

### Implementation Steps

1. Add case to switch statement in `src/handlers/command-handler.ts`
2. Implement handler function (database updates, file ops)
3. Return user-friendly message
4. Update `/help` command listing
5. Write unit tests

### Pattern

```typescript
interface CommandResult {
  success: boolean;
  message: string;
}

async function handleCommand(
  command: string,
  args: string[],
  conversationId: string
): Promise<CommandResult> {
  switch (command) {
    case 'mycommand':
      return await handleMyCommand(conversationId, args);
    default:
      return { success: false, message: `Unknown command: ${command}` };
  }
}
```

### Example: `/status`

```typescript
async function handleStatus(conversationId: string): Promise<CommandResult> {
  const conversation = await db.getConversation(conversationId);
  const codebase = await db.getCodebase(conversation.codebase_id);

  const message = `Codebase: ${codebase.name}\nCWD: ${conversation.cwd}`;
  return { success: true, message };
}
```

---

## Database Operations

Use `pg` (node-postgres) for PostgreSQL queries.

### Implementation Steps

1. Add functions to `src/db/` (conversations.ts, codebases.ts, sessions.ts)
2. Use parameterized queries (`$1`, `$2`) - never concatenate user input
3. Handle errors with try/catch, log with context
4. Return typed results

### Query Pattern

```typescript
import { pool } from './connection';

export async function getConversation(
  platform: string,
  platformConversationId: string
): Promise<Conversation | null> {
  const query = `
    SELECT * FROM conversations
    WHERE platform_type = $1 AND platform_conversation_id = $2
  `;

  try {
    const result = await pool.query(query, [platform, platformConversationId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Query failed', { error, platform, platformConversationId });
    throw new Error('Failed to fetch conversation');
  }
}
```

### Transaction Pattern

```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  const result1 = await client.query('INSERT INTO ...', [params]);
  const result2 = await client.query('INSERT INTO ...', [params]);

  await client.query('COMMIT');
  return { result1, result2 };
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### Best Practices

- **Security**: Always use `$1, $2` parameterized queries
- **Performance**: Connection pooling configured in `src/db/connection.ts`
- **Error Handling**: Log errors with context, don't expose SQL to users

---

## Testing

### Unit Tests

Co-locate with source: `src/handlers/command-handler.test.ts`

```typescript
describe('CommandHandler', () => {
  it('should parse command with args', () => {
    const result = parseCommand('/command-invoke plan "Add dark mode"');
    expect(result.command).toBe('command-invoke');
    expect(result.args).toEqual(['plan', 'Add dark mode']);
  });
});
```

### Integration Tests

```typescript
describe('Database Operations', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE conversations CASCADE');
  });

  it('should create and retrieve conversation', async () => {
    const conv = await createConversation({ platform_type: 'telegram' });
    const retrieved = await getConversation('telegram', conv.platform_conversation_id);
    expect(retrieved).toEqual(conv);
  });
});
```

---

## Deployment

**Environment Variables:**
- Add to `.env.example`
- Document in CLAUDE.md Configuration section

**Database Migrations:**
- Create SQL file in `migrations/`
- Apply: `psql $DATABASE_URL < migrations/002_add_feature.sql`
