# Database Schema

Reference for the 3-table PostgreSQL schema used by the Remote Coding Agent.

## Overview

Minimal 3-table schema with `remote_agent_` prefix.

**Design principles:**
- Store only essential data (paths, not content)
- Session persistence for resuming AI context
- One active session per conversation
- Platform-agnostic conversation tracking

## Schema Definition

**Location:** `migrations/001_initial_schema.sql`

### Table 1: remote_agent_codebases

**Purpose:** Repository metadata and command registry

```sql
CREATE TABLE remote_agent_codebases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  repository_url VARCHAR(500),
  default_cwd VARCHAR(500) NOT NULL,
  ai_assistant_type VARCHAR(20) NOT NULL DEFAULT 'claude',
  commands JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key fields:**
- `commands` - JSONB storing command registry: `{"prime": {"path": ".claude/commands/prime.md", "description": "Research codebase"}}`
- `ai_assistant_type` - Default AI assistant (`'claude'` | `'codex'`)

**Key principle:** Commands are Git-versioned files. Database stores only paths.

### Table 2: remote_agent_conversations

**Purpose:** Track platform conversations (Telegram chat, GitHub issue, etc.)

```sql
CREATE TABLE remote_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_type VARCHAR(20) NOT NULL,
  platform_conversation_id VARCHAR(255) NOT NULL,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  cwd VARCHAR(500),
  ai_assistant_type VARCHAR(20) NOT NULL DEFAULT 'claude',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform_type, platform_conversation_id)
);

CREATE INDEX idx_remote_agent_conversations_codebase
  ON remote_agent_conversations(codebase_id);
```

**Key fields:**
- `platform_type` - Platform identifier (`'telegram'` | `'github'` | `'slack'`)
- `platform_conversation_id` - Platform-specific ID (chat_id, "owner/repo#42")
- `ai_assistant_type` - **LOCKED at creation, cannot change mid-conversation**

**Unique constraint:** `(platform_type, platform_conversation_id)` ensures one conversation per chat/issue.

### Table 3: remote_agent_sessions

**Purpose:** Track AI SDK sessions for context persistence

```sql
CREATE TABLE remote_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  ai_assistant_type VARCHAR(20) NOT NULL,
  assistant_session_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE INDEX idx_remote_agent_sessions_conversation
  ON remote_agent_sessions(conversation_id, active);

CREATE INDEX idx_remote_agent_sessions_codebase
  ON remote_agent_sessions(codebase_id);
```

**CASCADE delete:** Sessions are automatically deleted when their parent conversation is deleted.

**Key fields:**
- `assistant_session_id` - SDK session ID for resume (Claude session ID, Codex thread ID)
- `active` - Only one active session per conversation
- `metadata` - JSONB for session state (e.g., `{lastCommand: "plan-feature"}`)

**Session persistence:** Sessions survive app restarts. Load `assistant_session_id` to resume.

## Database Operations

### Codebases

**Location:** `src/db/codebases.ts`

```typescript
createCodebase(data: {
  name: string;
  repository_url?: string;
  default_cwd: string;
  ai_assistant_type?: string;
}): Promise<Codebase>

getCodebase(id: string): Promise<Codebase | null>

registerCommand(codebaseId: string, name: string, def: { path: string; description: string }): Promise<void>

updateCodebaseCommands(codebaseId: string, commands: Record<string, { path: string; description: string }>): Promise<void>

getCodebaseCommands(codebaseId: string): Promise<Record<string, { path: string; description: string }>>
```

### Conversations

**Location:** `src/db/conversations.ts`

```typescript
// Idempotent - creates if doesn't exist, returns existing
getOrCreateConversation(platformType: string, platformConversationId: string): Promise<Conversation>

updateConversation(id: string, data: Partial<Conversation>): Promise<void>
```

### Sessions

**Location:** `src/db/sessions.ts`

```typescript
createSession(data: {
  conversation_id: string;
  codebase_id?: string;
  ai_assistant_type: string;
}): Promise<Session>

getActiveSession(conversationId: string): Promise<Session | null>

updateSession(id: string, assistantSessionId: string): Promise<void>

updateSessionMetadata(id: string, metadata: Record<string, unknown>): Promise<void>

deactivateSession(id: string): Promise<void>
```

## Session Lifecycle

### Normal Flow

```
1. User sends first message
   → getOrCreateConversation(platform, id)
   → getActiveSession(conversationId) // null

2. No session exists
   → createSession({ conversation_id, codebase_id, ai_assistant_type })

3. Send to AI, receive session ID
   → updateSession(session.id, aiSessionId)

4. User sends another message
   → getActiveSession(conversationId) // returns existing
   → Resume with assistant_session_id

5. User sends /reset
   → deactivateSession(session.id)
   → Next message creates new session
```

### Plan→Execute Transition

**Special case:** Only transition requiring new session.

```
1. /command-invoke plan-feature "Add dark mode"
   → getActiveSession() or createSession()
   → updateSessionMetadata({ lastCommand: 'plan-feature' })

2. /command-invoke execute
   → getActiveSession() // check metadata.lastCommand
   → lastCommand === 'plan-feature' → needsNewSession = true
   → deactivateSession(oldSession.id)
   → createSession({ active: true }) // Fresh context
```

**Implementation:** `src/orchestrator/orchestrator.ts:122-145`

## Common Patterns

### Idempotent Conversation Creation

```typescript
const conversation = await db.getOrCreateConversation(
  platform.getPlatformType(),
  conversationId
);
```

### Safe Session Handling

```typescript
const session = await sessionDb.getActiveSession(conversationId);

// Deactivate before creating new
if (session) {
  await sessionDb.deactivateSession(session.id);
}

const newSession = await sessionDb.createSession({
  conversation_id: conversationId,
  codebase_id: codebaseId,
  ai_assistant_type: aiType,
});
```

### Command Registry Updates

```typescript
const commands = await codebaseDb.getCodebaseCommands(codebaseId);
commands['new-command'] = {
  path: '.claude/commands/new.md',
  description: 'New command',
};
await codebaseDb.updateCodebaseCommands(codebaseId, commands);
```

### Metadata Tracking

```typescript
// Track last command for plan→execute detection
await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });

// Later, check metadata
const session = await sessionDb.getActiveSession(conversationId);
if (session?.metadata?.lastCommand === 'plan-feature') {
  // Create new session for execute
}
```

## Indexes

- **Conversations by codebase**: Fast lookup of conversations for a repo
- **Active sessions**: Fast lookup of active session for conversation
- **Sessions by codebase**: Fast lookup of sessions for a repo

## Constraints

**Unique conversations:** `UNIQUE(platform_type, platform_conversation_id)` ensures one conversation per chat/issue.

**Foreign keys:**
- Conversations → Codebases
- Sessions → Conversations (`ON DELETE CASCADE` - auto-cleanup)
- Sessions → Codebases

**Referential integrity:** Can't delete codebase with active conversations. Deleting a conversation automatically deletes its sessions.

## Migrations

**Running migrations:**

```bash
# Local PostgreSQL (with-db profile)
docker compose --profile with-db up -d

# Remote PostgreSQL
psql $DATABASE_URL < migrations/001_initial_schema.sql
```

**Verifying tables:**

```bash
psql $DATABASE_URL -c "\dt"
# Should show: remote_agent_codebases, remote_agent_conversations, remote_agent_sessions
```

## Reference Files

- **Schema Definition**: `migrations/001_initial_schema.sql`
- **Codebase Operations**: `src/db/codebases.ts`
- **Conversation Operations**: `src/db/conversations.ts`
- **Session Operations**: `src/db/sessions.ts`
- **Connection Pool**: `src/db/connection.ts`
