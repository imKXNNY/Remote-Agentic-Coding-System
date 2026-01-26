# Remote Agentic Coding Platform - MVP PRD

**Version:** 1.0
**Last Updated:** 2025-11-09
**Status:** Draft - Ready for Implementation Planning

---

## Architecture Philosophy

This is a **single-developer tool** built for practitioners of the Dynamous Agentic Coding Course. The architecture prioritizes simplicity, flexibility, and user control.

**Core Principles:**
1. Commands stored in codebase, versioned with Git
2. Manual workflow control via slash commands
3. Working directory + codebase context determine behavior
4. Minimal database schema (3 tables)
5. All credentials in environment variables
6. Generic command system - users define their own commands
7. Session history persisted with active flags

---

## Database Schema

**Note:** All tables use the `remote_agent_` prefix to avoid conflicts with existing database tables.

### 1. `remote_agent_conversations`
**Purpose:** Track each platform conversation

```sql
CREATE TABLE remote_agent_conversations (
  id UUID PRIMARY KEY,
  platform_type VARCHAR(20), -- 'slack', 'telegram', 'github'
  platform_conversation_id VARCHAR(255), -- thread_ts, chat_id, repo#123
  codebase_id UUID REFERENCES remote_agent_codebases(id), -- Which codebase context
  cwd VARCHAR(500), -- Current working directory
  ai_assistant_type VARCHAR(20), -- 'claude', 'codex' - SET AT CREATION, cannot change mid-conversation
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(platform_type, platform_conversation_id)
);

CREATE INDEX idx_remote_agent_conversations_codebase ON remote_agent_conversations(codebase_id);
```

**Note:** AI assistant type is set when conversation starts and cannot be changed. Session IDs are specific to each assistant and cannot be transferred.

### 2. `remote_agent_codebases`
**Purpose:** Define codebases and their commands

```sql
CREATE TABLE remote_agent_codebases (
  id UUID PRIMARY KEY,
  name VARCHAR(255), -- User-friendly name
  repository_url VARCHAR(500), -- GitHub repo URL
  default_cwd VARCHAR(500), -- Default working directory
  ai_assistant_type VARCHAR(20), -- 'claude', 'codex' (default for this codebase)
  commands JSONB, -- Command registry: {command_name: {path: "...", description: "..."}}
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**commands JSONB structure:**
```json
{
  "prime": {
    "path": ".claude/commands/prime.md",
    "description": "Research codebase to get AI up to speed"
  },
  "plan": {
    "path": ".claude/commands/plan-feature.md",
    "description": "Create detailed implementation plan"
  },
  "execute": {
    "path": ".claude/commands/execute-plan.md",
    "description": "Implement the planned feature"
  },
  "validate": {
    "path": ".claude/commands/code-review.md",
    "description": "Validate and test implementation"
  },
  "commit": {
    "path": ".claude/commands/commit.md",
    "description": "Create git commit with changes"
  }
}
```

### 3. `remote_agent_sessions`
**Purpose:** Track AI SDK sessions

```sql
CREATE TABLE remote_agent_sessions (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES remote_agent_conversations(id),
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  ai_assistant_type VARCHAR(20), -- 'claude', 'codex'
  assistant_session_id VARCHAR(255), -- SDK session ID for resume
  active BOOLEAN DEFAULT true, -- Only one active session per conversation
  metadata JSONB, -- Phase outputs, context, etc.
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE INDEX idx_remote_agent_sessions_conversation ON remote_agent_sessions(conversation_id, active);
CREATE INDEX idx_remote_agent_sessions_codebase ON remote_agent_sessions(codebase_id);
```

**Session Persistence:** Sessions persist across app restarts and are loaded from database.

**When new session needed:**
- Plan → Execute transition: Mark current session inactive, create new session

**Otherwise:** Resume existing active session

---

## Generic Command System

### Command Management

#### `/command-set <name> <path> [text]`
**Description:** Register or create a command for the current codebase

**Usage:**

```bash
# Register existing command file
/command-set prime .claude/commands/prime.md

# Create new command file inline
/command-set plan .claude/commands/plan-feature.md "You are an expert planner...
Create a detailed implementation plan for: $1
Output as JSON with steps, files, tests."
```

**Behavior:**
1. If `text` provided: Create file at `{cwd}/{path}` with content
2. Store command in `codebases.commands` JSONB
3. Validate path exists (if no text provided)

#### `/load-commands <folder>`
**Description:** Bulk load all commands from a folder

**Usage:**

```bash
# Load all .md files from commands folder
/load-commands .claude/commands

# Finds: prime.md, plan.md, execute.md, validate.md, commit.md
# Registers as: prime, plan, execute, validate, commit
```

**Behavior:**
1. Scan folder for `.md` files
2. Use filename (without `.md`) as command name
3. Register each file as a command in `codebases.commands`
4. Report which commands were loaded
5. Skip files that don't match pattern or already exist (with confirmation)

#### `/command-invoke <name> [args...]`
**Description:** Execute a registered command

**Usage:**

```bash
# Invoke command with no args
/command-invoke prime

# Invoke command with arguments (space-separated)
/command-invoke plan "Add dark mode toggle to header"

# Arguments available in command as $1, $2, $3, etc.
# Or $ARGUMENTS for all args as a single string
/command-invoke github-bug-fix 42
```

**Behavior:**
1. Look up command from `codebases.commands[name]`
2. Read command file from `{cwd}/{path}`
3. Replace variables: `$1`, `$2`, `$3`, `$ARGUMENTS`, etc.
4. Start or resume AI session with injected command
5. Stream responses back to platform

**If command not found:** Suggest using `/load-commands <folder>` or `/command-set` to register the command.

**Variable Reference:**
- `$1`, `$2`, `$3`, ... - Individual positional arguments
- `$ARGUMENTS` - All arguments as a single string
- Variables from previous phases: `$PLAN`, `$IMPLEMENTATION_SUMMARY`, etc.

### Built-in Commands

The platform supports a generic command system, but the recommended workflow includes:

- **`/prime`** - Research codebase to get AI up to speed
- **`/plan`** - Create detailed implementation plan
- **`/execute`** - Implement the planned feature
- **`/validate`** - Validate and test implementation
- **`/commit`** - Create git commit with changes
- **`/system-review`** - Analyze implementation against plan
- **`/code-review`** - Technical code review for quality/bugs
- **`/code-review-fix`** - Fix bugs found in code review
- **`/execution-report`** - Generate implementation report
- **`/github-bug-fix`** - RCA and fix for GitHub issue
- **`/create-prd`** - Create Product Requirements Document

Users define these commands via `/command-set`.

---

## Workflow & Session Management

### Primary Flow

**Recommended workflow:**
1. **Prime** (`/command-invoke prime`) - AI researches codebase
2. **Plan** (`/command-invoke plan "feature description"`) - Create plan
3. **Execute** (`/command-invoke execute`) - **NEW SESSION** - Implement with plan context
4. **Commit** (`/command-invoke commit`) - Same session - Create git commit

### Session Transitions

**Same Session (Resume):**
- Prime → Plan
- Execute → Commit
- Any command that doesn't require fresh context

**New Session (Fresh Context):**
- Plan → Execute - **Only transition requiring new session**
  - Execute gets plan from previous session metadata
  - Fresh context prevents token bloat during implementation

**Session Resume Logic:**
```typescript
// Pseudo-code
if (command === 'execute' && previousCommand === 'plan') {
  // Create new session
  const newSession = createSession({
    plan: previousSession.metadata.plan
  });
} else {
  // Resume existing active session
  const session = resumeActiveSession();
}
```

---

## Working Directory & Codebase Management

### `/clone <repo-url>`
**Description:** Clone GitHub repo

```bash
User: /clone https://github.com/user/my-app
Bot: Cloning... Done! Create codebase record? (y/n)
User: y
Bot: Codebase name: my-app
     Repository: https://github.com/user/my-app
     CWD: /workspace/my-app
     AI Assistant: claude (default, from codebase settings)
     ID: codebase_abc123

     Found commands folder: .claude/commands/
     Load all commands? (y/n)
User: y
Bot: Loaded 5 commands: prime, plan, execute, validate, commit
```

**Note:** AI assistant is inherited from codebase default. First message sent starts a conversation with that assistant and cannot be changed.

**Auto-detection:** If repo contains `.claude/commands/` or `.agents/commands/`, bot offers to load all commands automatically.

### `/codebase-switch <name-or-id>`
**Description:** Switch to different codebase context

```bash
User: /codebase-switch my-other-app
Bot: Switched to codebase: my-other-app
     CWD: /workspace/my-other-app
```

### `/getcwd`
**Description:** Show current working directory

```bash
User: /getcwd
Bot: Current working directory: /workspace/my-app
```

### `/setcwd <path>`
**Description:** Change working directory (updates conversation context)

```bash
User: /setcwd /workspace/my-app
Bot: Working directory set to /workspace/my-app
```

---

## Configuration Commands

### `/help`
**Description:** Show available slash commands

```bash
User: /help
Bot: Available Commands:

     Command Management:
       /command-set <name> <path> [text] - Register/create command
       /load-commands <folder> - Bulk load commands from folder
       /command-invoke <name> [args...] - Execute command
       /commands - List registered commands

     Codebase:
       /clone <repo-url> - Clone GitHub repo
       /codebase-switch <name> - Switch codebase
       /getcwd - Show working directory
       /setcwd <path> - Change working directory

     Session:
       /status - Show conversation state
       /reset - Force new session
       /help - Show this help
```

### `/commands`
**Description:** List all registered commands for current codebase

```bash
User: /commands
Bot: Registered Commands for my-app:

     prime - .claude/commands/prime.md
       Research codebase to get AI up to speed

     plan - .claude/commands/plan-feature.md
       Create detailed implementation plan

     execute - .claude/commands/execute-plan.md
       Implement the planned feature

     validate - .claude/commands/code-review.md
       Validate and test implementation

     commit - .claude/commands/commit.md
       Create git commit with changes
```

### `/status`
**Description:** Show conversation state

```bash
User: /status
Bot:
  Codebase: my-app (codebase_abc123)
  CWD: /workspace/my-app
  Assistant: claude
  Active Session: sess_xyz789

  Registered Commands:
    prime - Research codebase
    plan - Create implementation plan
    execute - Implement feature
    validate - Validate implementation
    commit - Create git commit
```

### `/reset`
**Description:** Force new session (clears context)

```bash
User: /reset
Bot: Session cleared. Starting fresh session.
     Previous session: sess_xyz789 (marked inactive)
     New session: sess_abc456
```

**Use when:** Stuck, need fresh context, or want to start over without plan→execute transition

---

## Platform Integration

**New Conversation Behavior:** If user sends a message and no codebase is configured, reply with: "No codebase configured. Use `/clone <repo-url>` to get started."

### Telegram

**API:** Telegram Bot API (SDK with polling)
**Conversation ID:** `chat_id` (DM) or `chat_id+message_thread_id` (topics)
**Auth:** Bot token in environment variable

**Environment Variables:**
```env
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_STREAMING_MODE=stream  # stream (default) | batch
```

**Streaming Behavior:**
- **stream** (default): Send each AI response chunk as separate message (real-time experience)
- **batch**: Accumulate all chunks, send single final message

**Interaction:**
- User sends message to bot
- Bot processes via SDK polling (not webhooks)
- All slash commands work

### Slack

**API:** Slack Bot SDK
**Conversation ID:** `thread_ts` (or `message.ts` if not threaded)
**Auth:** Bot token in environment variable

**Environment Variables:**
```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_STREAMING_MODE=stream  # stream (default) | batch
```

**Streaming Behavior:**
- **stream** (default): Send each AI response chunk as separate message (real-time experience)
- **batch**: Accumulate all chunks, send single final message

**Required OAuth Scopes:**
- `chat:write` - Send messages
- `im:history` - Read direct messages
- `app_mentions:read` - Detect @mentions in channels

**Interaction:**
- User DMs bot or @mentions in thread
- Bot processes via SDK (not webhooks)
- All slash commands work

### GitHub

**API:** GitHub CLI + REST API + Webhooks
**Conversation ID:** `repo_full_name#issue_number` (e.g., `user/repo#42`)

**Environment Variables:**
```env
# GitHub Personal Access Token - Used for all operations
# (webhooks, clone, commit, push, PR creation, issue management)
GITHUB_TOKEN=ghp_...
GH_TOKEN=ghp_...  # Same token, used by gh CLI

# Webhook Secret - For verifying webhook signatures
WEBHOOK_SECRET=<random string for webhook verification>

GITHUB_STREAMING_MODE=batch  # stream | batch (default)
```

**Streaming Behavior:**
- **batch** (default): Accumulate all chunks, post single comment (avoid comment spam)
- **stream**: Send each chunk as separate comment (NOT recommended - creates noise)

**Authentication Strategy:**
- Uses **Personal Access Token** for all GitHub operations (webhooks, CLI, API)
- Simple setup: Generate token with `repo` scope, add to webhooks manually
- Per-repository webhooks (or organization-level for all repos in an org)

**Required Token Scopes:**
- **repo**: Full control of private repositories (includes issues, PRs, contents)

**Trigger Phrases Required:**
```
@coding-assistant plan this feature
@coding-assistant review this PR
@coding-assistant /command-invoke execute
```

**Webhook Events:**
- `issues.opened`, `issue_comment.created`
- `pull_request.opened`, `pull_request_review_comment.created`

**Workflow:**
1. User creates issue/PR or comments
2. GitHub sends webhook to `/webhooks/github` (configured per-repo or org-wide)
3. Scan comment for `@coding-assistant <action>`
4. Process command using GitHub CLI for operations
5. Reply via GitHub REST API

---

## Architecture Layers

### 1. Platform Adapters

**Interface:** `IPlatformAdapter`

```typescript
interface IPlatformAdapter {
  receiveMessage(): Promise<{conversationId: string, message: string}>;
  sendMessage(conversationId: string, message: string): Promise<void>;
  getConversationId(event: any): string;
}
```

**Implementations:**
- `SlackAdapter` - Slack Bot SDK
- `TelegramAdapter` - Telegram Bot SDK (polling)
- `GitHubAdapter` - GitHub Webhooks + REST API

### 2. Command Handler

**Responsibility:** Process slash commands (deterministic logic)

**Commands:**
- `/command-set`, `/command-invoke`, `/load-commands`
- `/clone`, `/getcwd`, `/setcwd`, `/codebase-switch`
- `/status`, `/commands`, `/help`, `/reset`

**Behavior:** Update database, perform operations, return response (no AI)

### 3. Orchestrator

**Responsibility:** Manage AI conversations

**Flow:**
```typescript
async handleMessage(platformId, conversationId, message) {
  // 1. Load conversation + codebase from DB
  const conv = await loadConversation(conversationId);
  const codebase = await loadCodebase(conv.codebase_id);

  // 2. Parse command or message
  if (isCommandInvoke(message)) {
    const {command, args} = parseCommand(message);
    const commandDef = codebase.commands[command];

    // 3. Check if new session needed
    let session;
    if (command === 'execute' && previousWasPlanning) {
      session = await createNewSession({
        plan: previousSession.metadata.plan
      });
    } else {
      session = await resumeActiveSession(conv.id);
    }

    // 4. Load and inject command
    const commandText = await readFile(`${conv.cwd}/${commandDef.path}`);
    const injected = replaceVariables(commandText, args);

    // 5. Send to AI and stream response
    await aiClient.sendMessage(session, injected);
    for await (const chunk of aiClient.streamResponse()) {
      await platformAdapter.sendMessage(conversationId, chunk);
    }

    // 6. Save session state
    await saveSession(session);
  }
}
```

### 4. AI Assistant Clients

**Interface:** `IAssistantClient`

```typescript
interface IAssistantClient {
  startSession(cwd: string, systemPrompt: string): Promise<string>;
  resumeSession(sessionId: string): Promise<void>;
  sendMessage(message: string): Promise<void>;
  streamResponse(): AsyncIterator<MessageChunk>;
  endSession(): Promise<void>;
}
```

**Implementations:**
- `ClaudeClient` - `@anthropic-ai/claude-agent-sdk`
- `CodexClient` - `@openai/codex-sdk`

**Streaming Response Handling:**
- Stream events from AI SDK in real-time
- Platform-specific streaming mode configured via environment variables
- **Stream mode:** Send each chunk immediately (real-time, chat platforms)
- **Batch mode:** Accumulate chunks, send final response (single message, issue trackers)
- Event types: `text` (agent messages), `tool` (tool usage), `thinking` (optional)
- Pattern: `for await (const event of events) { mode === 'stream' ? await platform.send(event) : buffer.push(event) }`
- Reference implementation: `.agents/examples/codex-telegram-bot/dist/bot/handlers/message.js:74-134`

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# AI Assistants
# Claude - Choose one:
CLAUDE_API_KEY=sk-ant-...
# OR
CLAUDE_OAUTH_TOKEN=sk-ant-oat01-...

# Codex
CODEX_ID_TOKEN=eyJ...
CODEX_ACCESS_TOKEN=eyJ...
CODEX_REFRESH_TOKEN=rt_...
CODEX_ACCOUNT_ID=...

# Platforms
TELEGRAM_BOT_TOKEN=<from @BotFather>
SLACK_BOT_TOKEN=xoxb-...
GITHUB_TOKEN=ghp_...
WEBHOOK_SECRET=<random string for GitHub webhook verification>

# Platform Streaming Mode (stream | batch)
# - stream: Send each AI response chunk as separate message (real-time)
# - batch: Accumulate chunks, send only final complete response
TELEGRAM_STREAMING_MODE=stream  # Default: stream (real-time chat experience)
SLACK_STREAMING_MODE=stream     # Default: stream (real-time chat experience)
GITHUB_STREAMING_MODE=batch     # Default: batch (single comment, avoid spam)

# Optional
WORKSPACE_PATH=/workspace
PORT=3000
```

---

## Docker & Deployment

### Docker Compose Profiles

#### Profile 1: App Only (Remote Database)
```bash
docker-compose up
```

Uses `DATABASE_URL` from environment for remote PostgreSQL.

#### Profile 2: App + Local PostgreSQL
```bash
docker-compose --profile with-db up
```

Starts both app container and PostgreSQL container.

### docker-compose.yml Structure

```yaml
services:
  app:
    build: .
    env_file: .env
    ports:
      - "3000:3000"
    volumes:
      - ${WORKSPACE_PATH:-./workspace}:/workspace
    depends_on:
      - postgres # Only when using with-db profile

  postgres:
    image: postgres:18
    profiles: ["with-db"]
    environment:
      POSTGRES_DB: remote_coding_agent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### Dockerfile

```dockerfile
FROM node:20-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    gnupg \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

CMD ["npm", "start"]
```

---

## API Endpoints

### Webhooks

#### `POST /webhooks/github`
- **Auth:** Verify `X-Hub-Signature-256`
- **Handles:** Issues, PRs, comments
- **Trigger Detection:** Scan for `@coding-assistant <action>`

### Health Check

#### `GET /health`
- Returns app status and database connectivity

---

## Security

### Authentication
- All platform credentials in environment variables
- No tokens stored in database
- Tokens never logged or exposed

### Webhook Verification
- **GitHub:** Verify `X-Hub-Signature-256` with `WEBHOOK_SECRET`

### Data Privacy
- Code never stored in database
- Only session metadata persisted
- User controls conversation/session deletion
- No external analytics without user consent

---

## Complete User Workflow Example

### Initial Setup

```bash
# 1. Deploy with Docker Compose
docker-compose --profile with-db up -d

# 2. Configure environment variables in .env

# 3. Start conversation in Slack/Telegram
```

### First-Time Codebase Setup

```
User: /clone https://github.com/user/my-app
Bot: Cloning... Done! Create codebase record? (y/n)
User: y
Bot: Codebase created: my-app (ID: codebase_abc123)
     CWD: /workspace/my-app

User: /command-set prime .claude/commands/prime.md
Bot: Command 'prime' registered

User: /command-set plan .claude/commands/plan-feature.md
Bot: Command 'plan' registered

User: /command-set execute .claude/commands/execute-plan.md
Bot: Command 'execute' registered

User: /command-set commit .claude/commands/commit.md
Bot: Command 'commit' registered

User: /status
Bot:
  Codebase: my-app
  CWD: /workspace/my-app
  Assistant: claude

  Commands:
    prime - .claude/commands/prime.md
    plan - .claude/commands/plan-feature.md
    execute - .claude/commands/execute-plan.md
    commit - .claude/commands/commit.md
```

### Using the System

```
User: /command-invoke prime
Bot: (AI starts researching codebase)
Bot: I've analyzed the codebase. Here's what I found...

User: /command-invoke plan "Add dark mode toggle to header"
Bot: (AI creates implementation plan)
Bot: Here's the implementation plan:
     1. Create DarkModeToggle component
     2. Add context for theme state
     3. Update CSS variables
     ...

User: /command-invoke execute
Bot: (NEW SESSION created with plan context)
Bot: Starting implementation based on your plan...
     (AI implements feature)

User: /command-invoke commit
Bot: (Same session)
Bot: Creating git commit...
     git commit -m "feat: Add dark mode toggle to header"
     Done!
```

---

## Success Metrics

### User Validation
- ✅ Successfully use from phone via Slack/Telegram
- ✅ Complete full workflow remotely (prime → plan → execute → commit)
- ✅ GitHub issue-based workflow functional

### Technical
- ✅ < 2 second response latency
- ✅ Commands load successfully from codebase
- ✅ Session transitions work correctly
- ✅ AI sessions resume properly

### Qualitative
- ✅ Setup takes < 15 minutes
- ✅ Command system feels intuitive
- ✅ Workflow feels natural

---

## Out of Scope for MVP

- ❌ Multi-user/multi-tenant support (authentication, isolation)
- ❌ Web dashboard UI
- ❌ Team features
- ❌ More than 3 platforms
- ❌ More than 2 AI assistants
- ❌ Command marketplace
- ❌ Analytics dashboard
- ❌ Automatic session transitions
- ❌ Voice interface

## Required for Production (Post-MVP)

- ✅ **Multi-threaded conversation handling** - Currently single-threaded, blocking. MUST implement worker pool or queue system before production use with multiple users.
- ✅ Rate limiting - Prevent API abuse and quota exhaustion
- ✅ Retry logic - Handle transient failures gracefully
- ✅ Monitoring - Observability into performance and errors

---

## Risks and Mitigations

### SDK Breaking Changes
**Risk:** Claude or Codex SDK updates break functionality
**Mitigation:** Pin versions, abstract behind interfaces, monitor changelogs

### Session State Corruption
**Risk:** Active session tracking becomes inconsistent
**Mitigation:** Database constraints, transaction safety, recovery mechanisms

### Webhook Reliability
**Risk:** GitHub webhooks fail or timeout
**Mitigation:** Retry logic, event queue, monitoring

### Single-Threaded Blocking (CRITICAL)
**Risk:** Current implementation is single-threaded - long-running AI operations block all other conversations
**Impact:** If User A asks a complex question requiring 2 minutes of Claude processing, User B's messages are queued and delayed
**Required Solution:** Multi-threaded conversation handling
**Mitigation Strategy:**
- Worker pool pattern: Process conversations concurrently
- Queue-based architecture: Redis/BullMQ for conversation queue
- Multiple Node.js worker processes
- Database connection pooling (already implemented)
- Each conversation gets independent execution context
- Maximum concurrent conversations configurable (e.g., 5-10)
**Priority:** High - Required before production use with multiple users

---

## Next Steps

### Phase 1: MVP Implementation
1. Database schema (SQL scripts)
2. Platform adapters (Telegram SDK, Slack SDK, GitHub webhooks)
3. Command handler (slash commands)
4. Orchestrator (AI conversation management)
5. AI assistant clients (Claude, Codex wrappers)
6. Docker + Docker Compose setup
7. `.env.example` template with all required variables
8. `README.md` with setup instructions:
   - Creating Telegram bot with BotFather
   - Creating Slack app and getting bot token
   - Creating GitHub personal access token and configuring webhooks
   - Environment variable configuration
   - Docker deployment steps
9. End-to-end testing

### Phase 2: Enhancements
- Web dashboard for codebase/command management
- More platforms (Discord, MS Teams)
- Command template library
- Usage analytics

### Phase 3: Advanced
- Multi-user support
- Team features
- Command marketplace
- Additional AI assistants

---

**This PRD defines the architecture for a flexible, user-controlled remote agentic coding platform.**
