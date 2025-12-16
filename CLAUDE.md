## Archon Rules to Always Follow:

@.agents/reference/archon-rules.md

---

## IMPORTANT: Archon project id: c9bd0aa0-4298-48c5-8f1f-28ef7c142240

## Project Overview

**Remote Agentic Coding Platform**: Control AI coding assistants (Claude Code SDK, Codex SDK) remotely from Slack, Telegram, and GitHub. Built with **Node.js + TypeScript + PostgreSQL**, single-developer tool for practitioners of the Dynamous Agentic Coding Course. Architecture prioritizes simplicity, flexibility, and user control.

> ✅ **New**: Gemini assistants are now supported. Follow [docs/assistants/gemini.md](docs/assistants/gemini.md) for credential setup, validation, and code-execution notes.

## Core Principles

**Single-Developer Tool**
- No multi-tenant complexity
- Commands versioned with Git (not stored in database)
- All credentials in environment variables only
- 3-table database schema (conversations, codebases, sessions)

**User-Controlled Workflows**
- Manual phase transitions via slash commands
- Generic command system - users define their own commands
- Working directory + codebase context determine behavior
- Session persistence across restarts

**Platform Agnostic**
- Unified conversation interface across Slack/Telegram/GitHub
- Platform adapters implement `IPlatformAdapter`
- Stream AI responses in real-time to all platforms

**Type Safety (CRITICAL)**
- Strict TypeScript configuration enforced
- All functions must have complete type annotations
- No `any` types without explicit justification
- Interfaces for all major abstractions

## Essential Commands

### Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start development server
npm run dev

# Start production server
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/handlers/command-handler.test.ts
```

### Type Checking

```bash
# TypeScript compiler check
npm run type-check

# Or use tsc directly
npx tsc --noEmit
```

### Linting & Formatting

```bash
# Check linting
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting (CI-safe)
npm run format:check
```

**Code Quality Setup:**
- **ESLint**: Flat config with TypeScript-ESLint (strict rules, 0 errors enforced)
- **Prettier**: Opinionated formatter (single quotes, semicolons, 2-space indent)
- **Integration**: ESLint + Prettier configured to work together (no conflicts)
- **Validation**: All PRs must pass `lint` and `format:check` before merge

### Database

```bash
# Run SQL migrations (manual)
psql $DATABASE_URL < migrations/001_initial_schema.sql

# Start PostgreSQL (Docker)
docker-compose --profile with-db up -d postgres
```

### Docker

```bash
# Build and start all services (app + postgres)
docker-compose --profile with-db up -d --build

# Start app only (remote database)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down
```

## Architecture

### Directory Structure

```
src/
├── adapters/       # Platform adapters (Slack, Telegram, GitHub)
│   ├── slack.ts
│   ├── telegram.ts
│   └── github.ts
├── clients/        # AI assistant clients (Claude, Codex)
│   ├── claude.ts
│   └── codex.ts
├── handlers/       # Command handler (slash commands)
│   └── command-handler.ts
├── orchestrator/   # AI conversation management
│   └── orchestrator.ts
├── db/             # Database connection, queries
│   ├── connection.ts
│   ├── conversations.ts
│   ├── codebases.ts
│   └── sessions.ts
├── types/          # TypeScript types and interfaces
│   └── index.ts
├── utils/          # Shared utilities
│   └── variable-substitution.ts
└── index.ts        # Entry point (Express server)
```

### Database Schema

**3 Tables:**
1. **`conversations`** - Track platform conversations (Slack thread, Telegram chat, GitHub issue)
2. **`codebases`** - Define codebases and their commands (JSONB)
3. **`sessions`** - Track AI SDK sessions with resume capability

**Key Patterns:**
- Conversation ID format: Platform-specific (`thread_ts`, `chat_id`, `user/repo#123`)
- One active session per conversation
- Commands stored in codebase filesystem, paths in `codebases.commands` JSONB
- Session persistence: Sessions survive restarts, loaded from database

**Session Transitions:**
- **NEW session needed:** Plan → Execute transition only
- **Resume session:** All other transitions (prime→plan, execute→commit)

### Architecture Layers

**1. Platform Adapters** (`src/adapters/`)
- Implement `IPlatformAdapter` interface
- Handle platform-specific message formats
- **Slack**: SDK with polling (not webhooks), conversation ID = `thread_ts`
- **Telegram**: Bot API with polling, conversation ID = `chat_id`
- **GitHub**: Webhooks + GitHub CLI, conversation ID = `owner/repo#number`

**2. Command Handler** (`src/handlers/`)
- Process slash commands (deterministic, no AI)
- Commands: `/command-set`, `/command-invoke`, `/load-commands`, `/clone`, `/getcwd`, `/setcwd`, `/codebase-switch`, `/status`, `/commands`, `/help`, `/reset`
- Update database, perform operations, return responses

**3. Orchestrator** (`src/orchestrator/`)
- Manage AI conversations
- Load conversation + codebase context from database
- Variable substitution: `$1`, `$2`, `$3`, `$ARGUMENTS`, `$PLAN`
- Session management: Create new or resume existing
- Stream AI responses to platform

**4. AI Assistant Clients** (`src/clients/`)
- Implement `IAssistantClient` interface
- **ClaudeClient**: `@anthropic-ai/claude-agent-sdk`
- **CodexClient**: `@openai/codex-sdk`
- Streaming: `for await (const event of events) { await platform.send(event) }`

### Configuration

**Environment Variables:**

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# AI Assistants
CLAUDE_API_KEY=sk-ant-...
# OR
CLAUDE_OAUTH_TOKEN=sk-ant-oat01-...

CODEX_ID_TOKEN=eyJ...
CODEX_ACCESS_TOKEN=eyJ...
CODEX_REFRESH_TOKEN=rt_...
CODEX_ACCOUNT_ID=...

# Platforms
TELEGRAM_BOT_TOKEN=<from @BotFather>
SLACK_BOT_TOKEN=xoxb-...
GITHUB_TOKEN=ghp_...
GITHUB_APP_ID=12345
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
WEBHOOK_SECRET=<random string>

# Platform Streaming Mode (stream | batch)
TELEGRAM_STREAMING_MODE=stream  # Default: stream
SLACK_STREAMING_MODE=stream     # Default: stream
GITHUB_STREAMING_MODE=batch     # Default: batch

# Optional
WORKSPACE_PATH=/workspace
PORT=3000
```

**Loading:** Use `dotenv` package, load in `src/index.ts`

## Development Guidelines

### When Creating New Features

**See detailed implementation guide:** `.agents/reference/new-features.md`

**Quick reference:**
- **Platform Adapters**: Implement `IPlatformAdapter`, handle auth, polling/webhooks
- **AI Clients**: Implement `IAssistantClient`, session management, streaming
- **Slash Commands**: Add to command-handler.ts, update database, no AI
- **Database Operations**: Use `pg` with parameterized queries, connection pooling

### Type Checking

**Critical Rules:**
- All functions must have return type annotations
- All parameters must have type annotations
- Use interfaces for contracts (`IPlatformAdapter`, `IAssistantClient`)
- Avoid `any` - use `unknown` and type guards instead
- Enable `strict: true` in `tsconfig.json`

**Example:**
```typescript
// ✅ CORRECT
async function sendMessage(conversationId: string, message: string): Promise<void> {
  await adapter.sendMessage(conversationId, message);
}

// ❌ WRONG - missing return type
async function sendMessage(conversationId: string, message: string) {
  await adapter.sendMessage(conversationId, message);
}
```

### Testing

**Unit Tests:**
- Test pure functions (variable substitution, command parsing)
- Mock external dependencies (database, AI SDKs, platform APIs)
- Fast execution (<1s total)
- Use Jest or similar framework

**Integration Tests:**
- Test database operations with test database
- Test end-to-end flows (mock platforms/AI but use real orchestrator)
- Clean up test data after each test

**Pattern:**
```typescript
describe('CommandHandler', () => {
  it('should parse /command-invoke with arguments', () => {
    const result = parseCommand('/command-invoke plan "Add dark mode"');
    expect(result.command).toBe('plan');
    expect(result.args).toEqual(['Add dark mode']);
  });
});
```

**Manual Validation with Test Adapter:**

The application includes a built-in test adapter (`src/adapters/test.ts`) with HTTP endpoints for programmatic testing without requiring Telegram/Slack setup.

**Test Adapter Endpoints:**
```bash
# Send message to bot (triggers full orchestrator flow)
POST http://localhost:3000/test/message
Body: {"conversationId": "test-123", "message": "/help"}

# Get bot responses (all messages sent by bot)
GET http://localhost:3000/test/messages/test-123

# Clear conversation history
DELETE http://localhost:3000/test/messages/test-123
```

**Complete Test Workflow:**
```bash
# 1. Start application
docker-compose up -d
# Wait for startup (check logs)
docker-compose logs -f app

# 2. Send test message
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-123","message":"/status"}'

# 3. Verify bot response
curl http://localhost:3000/test/messages/test-123 | jq

# 4. Clean up
curl -X DELETE http://localhost:3000/test/messages/test-123
```

**Test Adapter Features:**
- Implements `IPlatformAdapter` (same interface as Telegram/Slack)
- In-memory message storage (no external dependencies)
- Tracks message direction (sent by bot vs received from user)
- Full orchestrator integration (real AI, real database)
- Useful for feature validation, debugging, and CI/CD integration

**When to Use Test Adapter:**
- ✅ Manual validation after implementing new features
- ✅ End-to-end testing of command flows
- ✅ Debugging orchestrator logic without Telegram setup
- ✅ Automated integration tests (future CI/CD)
- ❌ NOT for unit tests (use Jest mocks instead)

### Logging

**Use `console.log` with structured data for MVP:**

```typescript
// Good: Structured logging
console.log('[Orchestrator] Starting session', {
  conversationId,
  codebaseId,
  command: 'plan',
  timestamp: new Date().toISOString()
});

// Good: Error logging with context
console.error('[GitHub] Webhook signature verification failed', {
  error: err.message,
  timestamp: new Date().toISOString()
});

// Bad: Generic logs
console.log('Processing...');
```

**What to Log:**
- Session start/end with IDs
- Command invocations with arguments
- AI streaming events (start, chunks received, completion)
- Database operations (queries, errors)
- Platform adapter events (message received, sent)
- Errors with full stack traces

**What NOT to Log:**
- API keys, tokens, secrets (mask: `token.slice(0, 8) + '...'`)
- User message content in production (privacy)
- Personal identifiable information

### Streaming Patterns

**AI Response Streaming:**
Platform streaming mode configured per platform via environment variables (`{PLATFORM}_STREAMING_MODE`).

```typescript
// Stream mode: Send each chunk immediately (real-time)
for await (const event of client.streamResponse()) {
  if (streamingMode === 'stream') {
    if (event.type === 'text') {
      await platform.sendMessage(conversationId, event.content);
    } else if (event.type === 'tool') {
      await platform.sendMessage(conversationId, `🔧 ${event.toolName}`);
    }
  } else {
    // Batch mode: Accumulate chunks
    buffer.push(event);
  }
}

// Batch mode: Send accumulated response
if (streamingMode === 'batch') {
  const fullResponse = buffer.map(e => e.content).join('');
  await platform.sendMessage(conversationId, fullResponse);
}
```

**Platform-Specific Defaults:**
- **Telegram/Slack**: `stream` mode (real-time chat experience)
- **GitHub**: `batch` mode (single comment, avoid spam)
- **Future platforms** (Asana, Notion): `batch` mode (single update)
- **Typing indicators**: Send periodically during long operations in `stream` mode

### Command System Patterns

**Variable Substitution:**
- `$1`, `$2`, `$3` - Positional arguments
- `$ARGUMENTS` - All arguments as single string
- `$PLAN` - Previous plan from session metadata
- `$IMPLEMENTATION_SUMMARY` - Previous execution summary

**Command Files:**
- Stored in codebase (e.g., `.claude/commands/plan.md`)
- Plain text/markdown format
- Users edit with Git version control
- Paths stored in `codebases.commands` JSONB

**Auto-detection:**
- On `/clone`, detect `.claude/commands/` or `.agents/commands/`
- Offer to bulk load with `/load-commands`

### Error Handling

**Database Errors:**
```typescript
try {
  await db.query('INSERT INTO conversations ...', params);
} catch (error) {
  console.error('[DB] Insert failed', { error, params });
  throw new Error('Failed to create conversation');
}
```

**Platform Errors:**
```typescript
try {
  await telegram.sendMessage(chatId, message);
} catch (error) {
  console.error('[Telegram] Send failed', { error, chatId });
  // Don't retry - let user know manually
}
```

**AI SDK Errors:**
```typescript
try {
  await claudeClient.sendMessage(session, prompt);
} catch (error) {
  console.error('[Claude] Session error', { error, sessionId });
  await platform.sendMessage(conversationId, '❌ AI error. Try /reset');
}
```

### API Endpoints

**Webhooks:**
- `POST /webhooks/github` - GitHub webhook events
- Signature verification required (HMAC SHA-256)
- Return 200 immediately, process async

**Health Checks:**
- `GET /health` - Basic health check
- `GET /health/db` - Database connectivity check

**Security:**
- Verify webhook signatures (GitHub: `X-Hub-Signature-256`)
- Use `express.raw()` middleware for webhook body (signature verification)
- Never log or expose tokens in responses

### Docker Patterns

**Profiles:**
- Default: App only (remote database)
- `with-db`: App + PostgreSQL 18

**Volumes:**
- `/workspace` - Cloned repositories
- Mount via `WORKSPACE_PATH` env var

**Networking:**
- App: Port 3000
- PostgreSQL: Port 5432 (only exposed with `with-db` profile)

### GitHub-Specific Patterns

**Authentication:**
- GitHub CLI operations: Use `GITHUB_TOKEN` (personal access token)
- Webhook events: Use GitHub App credentials (`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`)

**Operations:**
```bash
# Clone repo
git clone https://github.com/user/repo.git /workspace/repo

# Create PR
gh pr create --title "Fix #42" --body "Fixes #42"

# Comment on issue
gh issue comment 42 --body "Working on this..."

# Review PR
gh pr review 15 --comment -b "Looks good!"
```

**@Mention Detection:**
- Parse `@coding-assistant` in issue/PR descriptions and comments
- Events: `issues`, `issue_comment`, `pull_request`

## Common Workflows

**Fix Issue (GitHub):**
1. User: `@coding-assistant fix this` on issue #42
2. Webhook: Trigger detected, conversationId = `user/repo#42`
3. Clone repo if needed
4. AI: Analyze issue, make changes, commit
5. `gh pr create` with "Fixes #42"
6. Comment on issue with PR link

**Review PR (GitHub):**
1. User: `@coding-assistant review` on PR #15
2. Fetch PR diff: `gh pr diff 15`
3. AI: Review code, generate feedback
4. `gh pr review 15 --comment -b "feedback"`

**Remote Development (Telegram/Slack):**
1. `/clone https://github.com/user/repo`
2. `/load-commands .claude/commands`
3. `/command-invoke prime`
4. `/command-invoke plan "Add dark mode"`
5. `/command-invoke execute`
6. `/command-invoke commit`
