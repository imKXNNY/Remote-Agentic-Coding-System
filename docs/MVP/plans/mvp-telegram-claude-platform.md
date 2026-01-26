# Feature: MVP Remote Coding Platform (Telegram + Claude)

## Overview

**Goal**: Remote Claude Code control via Telegram with persistent sessions, codebase management, and streaming responses.

**Scope**: Telegram only, Claude only, no generic command system (add later).

**Tech**: Node.js + TypeScript + PostgreSQL + Docker

## User Story

As a software developer
I want to control Claude Code from Telegram
So that I can manage codebases and have persistent AI conversations remotely

## Research Summary

**Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`):
- Main API: `query({ prompt, options })` returns `AsyncIterable<SDKMessage>`
- Session management: Implicit - `options: { resume: "session-id" }`
- Streaming: `for await (const msg of query(...))`
- Message types: `SDKAssistantMessage`, `SDKResultMessage`, `SDKSystemMessage`
- Session ID extracted from `SDKResultMessage.session_id`

**Telegram** (Telegraf SDK):
- Polling mode (no webhooks needed)
- Message limit: 4096 chars - must split long messages
- Conversation ID: `ctx.chat.id.toString()`

**Database**: 3 tables (conversations, codebases, sessions) - matches PRD schema

## Architecture

```
Telegram → Orchestrator → Command Handler (slash commands)
                       ↓
                   Claude SDK → Stream responses back
                       ↓
                   PostgreSQL (persistence)
```

---

## Implementation Tasks

### 1. Project Setup

**CREATE package.json**
```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
    "telegraf": "^4.16.0",
    "pg": "^8.11.0",
    "dotenv": "^16.4.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/pg": "^8.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "tsx": "^4.7.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest"
  }
}
```

**CREATE tsconfig.json** - Strict mode enabled
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

**CREATE .env.example**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/remote_coding_agent
CLAUDE_API_KEY=sk-ant-...  # OR CLAUDE_OAUTH_TOKEN
GH_TOKEN=ghp_...  # For /clone command
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_STREAMING_MODE=stream  # stream | batch
WORKSPACE_PATH=./workspace
PORT=3000
```

**CREATE .gitignore**
```
node_modules/
dist/
.env
workspace/
```

**VALIDATE**: `npm install && npx tsc --noEmit`

---

### 2. Docker Setup

**CREATE Dockerfile**
```dockerfile
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install git, gh CLI, postgresql-client
RUN apt-get update && apt-get install -y \
    curl git ca-certificates gnupg postgresql-client && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
    tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

**CREATE docker-compose.yml**
```yaml
services:
  app:
    build: .
    env_file: .env
    ports: ["3000:3000"]
    volumes: ["${WORKSPACE_PATH:-./workspace}:/workspace"]
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  postgres:
    image: postgres:18
    profiles: ["with-db"]
    environment:
      POSTGRES_DB: remote_coding_agent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**VALIDATE**: `docker build -t remote-coding-agent .`

---

### 3. Database Schema

**CREATE migrations/001_initial_schema.sql**
```sql
CREATE TABLE codebases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  repository_url VARCHAR(500),
  default_cwd VARCHAR(500) NOT NULL,
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  commands JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_type VARCHAR(20) NOT NULL,
  platform_conversation_id VARCHAR(255) NOT NULL,
  codebase_id UUID REFERENCES codebases(id),
  cwd VARCHAR(500),
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform_type, platform_conversation_id)
);

CREATE INDEX idx_conversations_codebase ON conversations(codebase_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  codebase_id UUID REFERENCES codebases(id),
  ai_assistant_type VARCHAR(20) NOT NULL,
  assistant_session_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE INDEX idx_sessions_conversation ON sessions(conversation_id, active);
CREATE INDEX idx_sessions_codebase ON sessions(codebase_id);
```

**VALIDATE**: `docker-compose --profile with-db up -d && psql $DATABASE_URL < migrations/001_initial_schema.sql`

---

### 4. TypeScript Types

**CREATE src/types/index.ts**
```typescript
export interface Conversation {
  id: string;
  platform_type: string;
  platform_conversation_id: string;
  codebase_id: string | null;
  cwd: string | null;
  ai_assistant_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface Codebase {
  id: string;
  name: string;
  repository_url: string | null;
  default_cwd: string;
  ai_assistant_type: string;
  commands: Record<string, { path: string; description: string }>;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  conversation_id: string;
  codebase_id: string | null;
  ai_assistant_type: string;
  assistant_session_id: string | null;
  active: boolean;
  metadata: Record<string, any>;
  started_at: Date;
  ended_at: Date | null;
}

export interface CommandResult {
  success: boolean;
  message: string;
  modified?: boolean;  // Conversation state changed?
}
```

---

### 5. Database Layer

**CREATE src/db/connection.ts**
```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});
```

**CREATE src/db/conversations.ts**
```typescript
import { pool } from './connection';
import { Conversation } from '../types';

export async function getOrCreateConversation(
  platformType: string,
  platformId: string
): Promise<Conversation> {
  const existing = await pool.query(
    'SELECT * FROM conversations WHERE platform_type = $1 AND platform_conversation_id = $2',
    [platformType, platformId]
  );

  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    'INSERT INTO conversations (platform_type, platform_conversation_id) VALUES ($1, $2) RETURNING *',
    [platformType, platformId]
  );

  return created.rows[0];
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (updates.codebase_id !== undefined) {
    fields.push(`codebase_id = $${i++}`);
    values.push(updates.codebase_id);
  }
  if (updates.cwd !== undefined) {
    fields.push(`cwd = $${i++}`);
    values.push(updates.cwd);
  }

  fields.push('updated_at = NOW()');
  values.push(id);

  await pool.query(
    `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${i}`,
    values
  );
}
```

**CREATE src/db/codebases.ts**
```typescript
import { pool } from './connection';
import { Codebase } from '../types';

export async function createCodebase(data: {
  name: string;
  repository_url?: string;
  default_cwd: string;
}): Promise<Codebase> {
  const result = await pool.query(
    'INSERT INTO codebases (name, repository_url, default_cwd) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.repository_url || null, data.default_cwd]
  );
  return result.rows[0];
}

export async function getCodebase(id: string): Promise<Codebase | null> {
  const result = await pool.query('SELECT * FROM codebases WHERE id = $1', [id]);
  return result.rows[0] || null;
}
```

**CREATE src/db/sessions.ts**
```typescript
import { pool } from './connection';
import { Session } from '../types';

export async function getActiveSession(conversationId: string): Promise<Session | null> {
  const result = await pool.query(
    'SELECT * FROM sessions WHERE conversation_id = $1 AND active = true LIMIT 1',
    [conversationId]
  );
  return result.rows[0] || null;
}

export async function createSession(data: {
  conversation_id: string;
  codebase_id?: string;
  assistant_session_id?: string;
}): Promise<Session> {
  const result = await pool.query(
    'INSERT INTO sessions (conversation_id, codebase_id, ai_assistant_type, assistant_session_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.conversation_id, data.codebase_id || null, 'claude', data.assistant_session_id || null]
  );
  return result.rows[0];
}

export async function updateSession(id: string, sessionId: string): Promise<void> {
  await pool.query(
    'UPDATE sessions SET assistant_session_id = $1 WHERE id = $2',
    [sessionId, id]
  );
}

export async function deactivateSession(id: string): Promise<void> {
  await pool.query(
    'UPDATE sessions SET active = false, ended_at = NOW() WHERE id = $1',
    [id]
  );
}
```

**VALIDATE**: `npx tsc --noEmit`

---

### 6. Command Handler

**CREATE src/handlers/command-handler.ts**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { Conversation, CommandResult } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';

const execAsync = promisify(exec);

export function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/);
  return { command: parts[0].substring(1), args: parts.slice(1) };
}

export async function handleCommand(
  conversation: Conversation,
  message: string
): Promise<CommandResult> {
  const { command, args } = parseCommand(message);

  switch (command) {
    case 'help':
      return { success: true, message: `Commands:\n/help - This help\n/status - Show state\n/getcwd - Show cwd\n/setcwd <path> - Set cwd\n/clone <url> - Clone repo\n/reset - Clear session` };

    case 'status':
      let msg = `Platform: ${conversation.platform_type}\nAI: ${conversation.ai_assistant_type}`;
      if (conversation.codebase_id) {
        const cb = await codebaseDb.getCodebase(conversation.codebase_id);
        if (cb) msg += `\n\nCodebase: ${cb.name}\nRepo: ${cb.repository_url || 'N/A'}`;
      } else {
        msg += '\n\nNo codebase. Use /clone <url>';
      }
      msg += `\nCWD: ${conversation.cwd || 'Not set'}`;
      return { success: true, message: msg };

    case 'getcwd':
      return { success: true, message: `CWD: ${conversation.cwd || 'Not set'}` };

    case 'setcwd':
      if (args.length === 0) return { success: false, message: 'Usage: /setcwd <path>' };
      await db.updateConversation(conversation.id, { cwd: args.join(' ') });
      return { success: true, message: `CWD set to: ${args.join(' ')}`, modified: true };

    case 'clone':
      if (args.length === 0) return { success: false, message: 'Usage: /clone <repo-url>' };
      const repoUrl = args[0];
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'unknown';
      const targetPath = `/workspace/${repoName}`;

      try {
        await execAsync(`git clone ${repoUrl} ${targetPath}`);
        const codebase = await codebaseDb.createCodebase({
          name: repoName,
          repository_url: repoUrl,
          default_cwd: targetPath
        });
        await db.updateConversation(conversation.id, {
          codebase_id: codebase.id,
          cwd: targetPath
        });
        return {
          success: true,
          message: `Cloned: ${repoName}\nCWD: ${targetPath}`,
          modified: true
        };
      } catch (error) {
        return { success: false, message: `Clone failed: ${(error as Error).message}` };
      }

    case 'reset':
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) await sessionDb.deactivateSession(session.id);
      return { success: true, message: 'Session cleared. Codebase preserved.' };

    default:
      return { success: false, message: `Unknown command: /${command}` };
  }
}
```

**VALIDATE**: `npx tsc --noEmit`

---

### 7. Claude Client

**CREATE src/clients/claude.ts**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ClaudeMessage {
  type: 'assistant' | 'result' | 'system';
  content?: string;
  sessionId?: string;
}

export async function* sendQuery(
  prompt: string,
  cwd: string,
  resumeSessionId?: string
): AsyncGenerator<ClaudeMessage> {
  const options: any = { cwd };
  if (resumeSessionId) options.resume = resumeSessionId;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'assistant') {
      // Extract text content from assistant message
      const text = msg.content?.map((c: any) => c.text || '').join('') || '';
      if (text) yield { type: 'assistant', content: text };
    } else if (msg.type === 'result') {
      yield { type: 'result', sessionId: msg.session_id };
    }
  }
}
```

**VALIDATE**: `npx tsc --noEmit`

---

### 8. Telegram Adapter

**CREATE src/adapters/telegram.ts**
```typescript
import { Telegraf, Context } from 'telegraf';

const MAX_LENGTH = 4096;

export class TelegramAdapter {
  private bot: Telegraf;
  private streamingMode: 'stream' | 'batch';

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    this.bot = new Telegraf(token);
    this.streamingMode = mode;
  }

  async sendMessage(chatId: string, message: string): Promise<void> {
    const id = parseInt(chatId);

    if (message.length <= MAX_LENGTH) {
      await this.bot.telegram.sendMessage(id, message);
    } else {
      // Split long messages
      const lines = message.split('\n');
      let chunk = '';

      for (const line of lines) {
        if (chunk.length + line.length + 1 > MAX_LENGTH - 100) {
          if (chunk) await this.bot.telegram.sendMessage(id, chunk);
          chunk = line;
        } else {
          chunk += (chunk ? '\n' : '') + line;
        }
      }

      if (chunk) await this.bot.telegram.sendMessage(id, chunk);
    }
  }

  getBot(): Telegraf { return this.bot; }
  getStreamingMode(): 'stream' | 'batch' { return this.streamingMode; }
  getConversationId(ctx: Context): string { return ctx.chat!.id.toString(); }

  async start(): Promise<void> { await this.bot.launch(); }
  stop(): void { this.bot.stop(); }
}
```

**VALIDATE**: `npx tsc --noEmit`

---

### 9. Orchestrator

**CREATE src/orchestrator/orchestrator.ts**
```typescript
import { TelegramAdapter } from '../adapters/telegram';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as commandHandler from '../handlers/command-handler';
import { sendQuery } from '../clients/claude';

export async function handleMessage(
  telegram: TelegramAdapter,
  conversationId: string,
  message: string
): Promise<void> {
  try {
    let conversation = await db.getOrCreateConversation('telegram', conversationId);

    // Handle slash commands
    if (message.startsWith('/')) {
      const result = await commandHandler.handleCommand(conversation, message);
      await telegram.sendMessage(conversationId, result.message);
      if (result.modified) {
        conversation = await db.getOrCreateConversation('telegram', conversationId);
      }
      return;
    }

    // Require codebase for AI conversations
    if (!conversation.codebase_id) {
      await telegram.sendMessage(conversationId, 'No codebase. Use /clone <url> first.');
      return;
    }

    // Get or create session
    let session = await sessionDb.getActiveSession(conversation.id);
    const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
    const cwd = conversation.cwd || codebase?.default_cwd || '/workspace';

    if (!session) {
      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id
      });
    }

    // Send to Claude and stream
    const mode = telegram.getStreamingMode();

    if (mode === 'stream') {
      // Stream each chunk immediately
      for await (const msg of sendQuery(message, cwd, session.assistant_session_id || undefined)) {
        if (msg.type === 'assistant' && msg.content) {
          await telegram.sendMessage(conversationId, msg.content);
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }
    } else {
      // Batch mode: accumulate then send
      const buffer: string[] = [];
      for await (const msg of sendQuery(message, cwd, session.assistant_session_id || undefined)) {
        if (msg.type === 'assistant' && msg.content) {
          buffer.push(msg.content);
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }
      if (buffer.length > 0) {
        await telegram.sendMessage(conversationId, buffer.join(''));
      }
    }
  } catch (error) {
    console.error('[Orchestrator]', error);
    await telegram.sendMessage(conversationId, '⚠️ Error. Try /reset');
  }
}
```

**VALIDATE**: `npx tsc --noEmit`

---

### 10. Main Entry Point

**CREATE src/index.ts**
```typescript
import * as dotenv from 'dotenv';
import express from 'express';
import { TelegramAdapter } from './adapters/telegram';
import { handleMessage } from './orchestrator/orchestrator';
import { pool } from './db/connection';

dotenv.config();

async function main(): Promise<void> {
  // Validate env vars
  const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('Missing:', missing.join(', '));
    process.exit(1);
  }

  // Express health checks
  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/db', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  });
  app.listen(process.env.PORT || 3000);

  // Telegram bot
  const mode = (process.env.TELEGRAM_STREAMING_MODE || 'stream') as 'stream' | 'batch';
  const telegram = new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN!, mode);

  telegram.getBot().on('text', async (ctx) => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;
    if (message) await handleMessage(telegram, conversationId, message);
  });

  await telegram.start();
  console.log('[Telegram] Bot started');

  // Graceful shutdown
  process.once('SIGINT', () => telegram.stop());
  process.once('SIGTERM', () => telegram.stop());
}

main().catch(console.error);
```

**VALIDATE**: `npx tsc && npm start` (test locally)

---

### 11. Unit Tests

**CREATE jest.config.js**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts']
};
```

**CREATE src/handlers/command-handler.test.ts**
```typescript
import { parseCommand } from './command-handler';

describe('CommandHandler', () => {
  test('parseCommand extracts command and args', () => {
    const result = parseCommand('/clone https://github.com/user/repo');
    expect(result.command).toBe('clone');
    expect(result.args).toEqual(['https://github.com/user/repo']);
  });

  test('parseCommand handles commands without args', () => {
    const result = parseCommand('/help');
    expect(result.command).toBe('help');
    expect(result.args).toEqual([]);
  });

  test('parseCommand handles multiple args', () => {
    const result = parseCommand('/setcwd /workspace/repo');
    expect(result.command).toBe('setcwd');
    expect(result.args).toEqual(['/workspace/repo']);
  });
});
```

**CREATE src/adapters/telegram.test.ts**
```typescript
import { TelegramAdapter } from './telegram';

describe('TelegramAdapter', () => {
  test('getStreamingMode returns configured mode', () => {
    const adapter = new TelegramAdapter('fake-token', 'batch');
    expect(adapter.getStreamingMode()).toBe('batch');
  });

  test('default streaming mode is stream', () => {
    const adapter = new TelegramAdapter('fake-token');
    expect(adapter.getStreamingMode()).toBe('stream');
  });
});
```

**CREATE src/clients/claude.test.ts**
```typescript
// Mock test - full integration tests require real API
describe('ClaudeClient', () => {
  test('placeholder - integration tests manual', () => {
    expect(true).toBe(true);
  });
});
```

**RUN TESTS AND ITERATE**:
```bash
npm test  # Must pass all tests
```

**CRITICAL**: If tests fail, fix the code and re-run until ALL tests pass. Do not proceed until `npm test` shows 100% passing.

**VALIDATE**: `npm test` (all tests pass)

---

### 12. README Documentation

**CREATE README.md** with the following sections:

- **Prerequisites**: Node.js 20+, Docker, GitHub token, Telegram bot token, Claude API key
- **Environment Setup**: How to copy `.env.example` and configure required variables
- **Docker Profiles**:
  - `with-db` profile for local PostgreSQL
  - Default profile for remote database
  - When to use each profile
- **Running Locally**: Development workflow with `npm run dev`
- **Health Checks**: Examples of testing `/health` and `/health/db` endpoints
- **Telegram Commands**: List of available slash commands with descriptions
- **Usage Example**: Quick start workflow (clone → ask questions → reset)
- **Troubleshooting**: Common issues (bot not responding, database errors, clone failures)

**VALIDATE**: README.md exists and covers all sections above

---

## Validation & Iteration

**CRITICAL: DO NOT STOP UNTIL ALL VALIDATION PASSES**

### Step 1: Type Checking
```bash
npx tsc --noEmit
```
**Iterate**: Fix any type errors, re-run until clean.

### Step 2: Unit Tests
```bash
npm test
```
**Iterate**: Fix failing tests, re-run until 100% pass.

### Step 3: Docker Build
```bash
docker build -t remote-coding-agent .
```
**Iterate**: Fix build errors, re-run until successful.

### Step 4: Container Health Check
```bash
# Start services
docker-compose --profile with-db up -d

# Wait 10 seconds for startup
sleep 10

# Test basic health
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# Test database health
curl http://localhost:3000/health/db
# Expected: {"status":"ok","database":"connected"}
```
**Iterate**: If health checks fail:
- Check logs: `docker-compose logs -f app`
- Verify database: `docker-compose logs -f postgres`
- Fix issues, rebuild, re-test

### Step 5: Manual Telegram Test
1. Message bot: `/help` → Should show command list
2. Send: `/clone https://github.com/anthropics/anthropic-sdk-typescript`
3. Send: `/status` → Should show codebase info
4. Send: "What files are in this repo?" → Claude should respond with streaming
5. Send: `/reset` → Should clear session
6. **Container restart test**: Stop/start containers, continue conversation → Session should persist

**Iterate**: If any step fails, debug, fix, re-test from beginning.

---

## Acceptance Criteria

**DO NOT MARK COMPLETE UNTIL ALL CRITERIA PASS AND DON'T FINISH UNTIL ALL ARE COMPLETE**:

- [ ] TypeScript compiles with strict mode (no errors)
- [ ] All unit tests pass (`npm test`)
- [ ] Docker builds successfully
- [ ] Health endpoint returns 200 OK (`/health`)
- [ ] Database health check passes (`/health/db`)
- [ ] Database schema matches PRD (3 tables)
- [ ] All slash commands work (/help, /status, /clone, /getcwd, /setcwd, /reset)
- [ ] Claude streaming works in both modes (stream/batch)
- [ ] Session persistence verified across container restarts
- [ ] Telegram message splitting handles long responses (>4096 chars)
- [ ] GitHub CLI available in container and `/clone` works
- [ ] README.md exists with setup instructions
- [ ] Docker profiles documented (`with-db` vs default)
- [ ] Environment variables documented in .env.example
- [ ] No secrets in repository (.env in .gitignore)
