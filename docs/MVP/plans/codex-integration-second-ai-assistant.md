# Feature: Codex Integration - Second AI Assistant

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files etc.

## Feature Description

Implement Codex SDK as a second AI coding assistant alongside Claude, making the platform truly multi-assistant capable. This feature enables users to choose between Claude Code SDK and Codex SDK based on their codebase configuration, with proper session isolation and assistant-specific handling. The implementation leverages existing `IAssistantClient` abstraction and database schema (`ai_assistant_type` fields) while removing hardcoded Claude dependencies and adding dynamic assistant selection.

## User Story

As a remote coding agent user
I want to choose between Claude and Codex as my AI coding assistant
So that I can use the assistant best suited for my codebase and work with both assistants across different projects

## Problem Statement

Currently, Claude Code SDK is hardcoded throughout the application in three critical locations:
1. Main entry point instantiates only `ClaudeClient`
2. Session creation hardcodes `'claude'` string instead of using conversation's assistant type
3. Environment validation only checks for Claude credentials

The database schema already has `ai_assistant_type` fields in all 3 tables (conversations, codebases, sessions), but they are unused or rely on defaults. The orchestrator receives a hardcoded client instance rather than dynamically selecting based on conversation context.

This prevents users from:
- Using Codex SDK for codebases better suited to it
- Switching between assistants for different projects
- Taking advantage of the existing multi-assistant database architecture

## Solution Statement

Implement a factory pattern for dynamic AI assistant client instantiation, wire up existing `ai_assistant_type` database fields properly, and create `CodexClient` implementing `IAssistantClient`. Assistant selection will be inherited from codebase configuration (or environment default), locked at conversation creation, and enforced throughout the session lifecycle. The existing orchestrator abstraction requires no changes to its core logic—only the client instantiation mechanism changes from hardcoded to factory-based.

## Feature Metadata

**Feature Type**: Enhancement (Adding second provider to existing abstraction)
**Estimated Complexity**: Medium
**Primary Systems Affected**:
- Client layer (new CodexClient)
- Database operations (conversation, codebase, session creation)
- Main entry point (remove hardcoded instantiation)
- Orchestrator (use factory instead of parameter)

**Dependencies**:
- `@openai/codex-sdk` (new)
- Existing `@anthropic-ai/claude-agent-sdk`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

**Existing Client Pattern:**
- `src/clients/claude.ts` (entire file) - Why: ClaudeClient implementation pattern to mirror for CodexClient
- `src/types/index.ts` (lines 89-106) - Why: IAssistantClient interface that CodexClient must implement
- `src/types/index.ts` (lines 77-88) - Why: MessageChunk type for event mapping

**Database Operations:**
- `src/db/conversations.ts` (lines 7-26) - Why: getOrCreateConversation needs to set ai_assistant_type from codebase
- `src/db/sessions.ts` (line 22) - Why: Hardcoded 'claude' that must be replaced with parameter
- `src/db/codebases.ts` (lines 7-17) - Why: createCodebase needs ai_assistant_type parameter

**Orchestrator:**
- `src/orchestrator/orchestrator.ts` (lines 15-21) - Why: Function signature needs client parameter removed
- `src/orchestrator/orchestrator.ts` (lines 110-139) - Why: Session creation logic that passes assistant type

**Entry Point:**
- `src/index.ts` (lines 47-48) - Why: Hardcoded ClaudeClient instantiation to remove
- `src/index.ts` (lines 30-36) - Why: Credential validation to update for both assistants
- `src/index.ts` (lines 85, 140, 181) - Why: handleMessage calls that need client param removed

**Command Handler:**
- `src/handlers/command-handler.ts` (lines 101-164) - Why: /clone command for auto-detection of assistant type
- `src/handlers/command-handler.ts` (lines 66-88) - Why: /status command showing ai_assistant_type

**Reference Implementation:**
- `.agents/examples/codex-telegram-bot/dist/codex/client.js` (entire file) - Why: Codex SDK usage patterns (thread creation, resumption, options)
- `.agents/examples/codex-telegram-bot/dist/codex/events.js` (entire file) - Why: Event processing patterns for Codex streaming
- `.agents/examples/codex-telegram-bot/dist/bot/handlers/message.js` (lines 74-134) - Why: Codex streaming event loop with critical turn.completed break

### New Files to Create

- `src/clients/codex.ts` - CodexClient implementing IAssistantClient with thread-based session model
- `src/clients/factory.ts` - Assistant client factory with getAssistantClient(type: string) function
- `src/clients/codex.test.ts` - Unit tests for CodexClient (thread creation, resumption, event processing)

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

**Codex SDK:**
- [Codex Example Implementation](.agents/examples/codex-telegram-bot/dist/codex/client.js)
  - Specific sections: Thread creation (lines 25-29), Thread resumption (lines 38-47), getOrCreateThread pattern (lines 65-79)
  - Why: Shows exact Codex SDK API usage including synchronous operations and required options

- [Codex Example Event Processing](.agents/examples/codex-telegram-bot/dist/codex/events.js)
  - Specific sections: processItemCompleted (lines 13-48), Event type checking (lines 84-95)
  - Why: Maps Codex event types to our MessageChunk format

- [Codex Example Message Handler](.agents/examples/codex-telegram-bot/dist/bot/handlers/message.js#L74-L134)
  - Specific section: Event streaming loop with turn.completed break (line 132)
  - Why: **CRITICAL** - Shows required break statement to prevent 90-second timeout

**Project Documentation:**
- [PRD - Database Schema](.agents/PRD.md#L24-L109)
  - Specific section: ai_assistant_type field definitions and conversation/session relationship
  - Why: Defines assistant type inheritance and session isolation rules

- [PRD - /clone Command](.agents/PRD.md#L256-L277)
  - Specific section: AI assistant inheritance from codebase default
  - Why: Shows expected behavior for auto-detection and assistant selection

**Environment Setup:**
- [Codex Example .env](.agents/examples/codex-telegram-bot/.env#L1-L30)
  - Specific section: CODEX_ID_TOKEN, CODEX_ACCESS_TOKEN, CODEX_REFRESH_TOKEN, CODEX_ACCOUNT_ID
  - Why: Shows all required Codex environment variables and format

### Patterns to Follow

**Naming Conventions:**
```typescript
// Classes: PascalCase
export class CodexClient implements IAssistantClient

// Functions: camelCase with explicit return types
async *sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<MessageChunk>

// Interfaces: PascalCase with I prefix
interface IAssistantClient

// Constants: UPPER_CASE
const MAX_LENGTH = 4096
```

**Error Handling:**
```typescript
// Pattern from src/clients/claude.ts:100-106
try {
  // SDK operations
} catch (error) {
  console.error('[Codex] Query error:', error);
  throw new Error(`Codex query failed: ${(error as Error).message}`);
}
```

**Logging Pattern:**
```typescript
// Pattern from src/clients/claude.ts:67-69
if (resumeSessionId) {
  console.log(`[Codex] Resuming thread: ${resumeSessionId}`);
} else {
  console.log(`[Codex] Starting new thread in ${cwd}`);
}
```

**Database Query Pattern:**
```typescript
// Pattern from src/db/conversations.ts:11-14
const existing = await pool.query<Conversation>(
  'SELECT * FROM remote_agent_conversations WHERE platform_type = $1 AND platform_conversation_id = $2',
  [platformType, platformId]
);
```

**Factory Pattern:**
```typescript
// Similar to Express middleware pattern seen in src/index.ts
export function getAssistantClient(type: string): IAssistantClient {
  switch (type) {
    case 'claude':
      return new ClaudeClient();
    case 'codex':
      return new CodexClient();
    default:
      throw new Error(`Unknown assistant type: ${type}`);
  }
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (Install Dependencies & Create Interfaces)

Install Codex SDK and create the client factory infrastructure. This establishes the foundation for dynamic assistant selection without modifying existing functionality.

**Tasks:**
- Install `@openai/codex-sdk` package
- Create client factory with assistant type routing
- Validate package compatibility with Node 20+

### Phase 2: Core Implementation (CodexClient)

Implement CodexClient following IAssistantClient interface, using patterns from the Codex example implementation. This is the most complex phase, requiring careful event mapping and proper handling of Codex's thread-based model.

**Tasks:**
- Implement CodexClient class with thread management
- Map Codex events to MessageChunk format
- Handle turn.completed event with critical break statement
- Implement error handling and logging

### Phase 3: Database Wiring (Make ai_assistant_type Functional)

Wire up existing `ai_assistant_type` database fields to actually control assistant selection. Remove hardcoded values and implement inheritance from codebase to conversation to session.

**Tasks:**
- Update conversation creation to inherit assistant type from codebase
- Update session creation to use conversation's assistant type
- Add assistant type parameter to codebase creation
- Implement auto-detection in /clone command

### Phase 4: Integration (Remove Hardcoded Claude)

Remove hardcoded Claude dependencies from orchestrator and entry point, replacing with factory-based dynamic selection.

**Tasks:**
- Refactor orchestrator to use client factory instead of parameter
- Remove ClaudeClient instantiation from main entry point
- Update all handleMessage call sites
- Add environment variable validation for both assistants

### Phase 5: Testing & Validation

Comprehensive testing of both assistants, assistant switching, and session isolation.

**Tasks:**
- Write unit tests for CodexClient
- Test conversation creation with both assistant types
- Validate assistant locking (cannot change mid-conversation)
- End-to-end testing via test adapter

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: INSTALL @openai/codex-sdk package

- **IMPLEMENT**: Add Codex SDK to package.json dependencies
- **COMMAND**: `npm install @openai/codex-sdk`
- **VALIDATE**: `grep -q "@openai/codex-sdk" package.json && echo "Package installed"`

### Task 2: CREATE src/clients/factory.ts - AI client factory

- **IMPLEMENT**: Factory function that returns appropriate client based on type string
- **PATTERN**: Switch statement routing (similar to command-handler.ts:42-64)
- **IMPORTS**:
  ```typescript
  import { IAssistantClient } from '../types';
  import { ClaudeClient } from './claude';
  import { CodexClient } from './codex';
  ```
- **GOTCHA**: Throw descriptive error for unknown assistant types
- **VALIDATE**: `npm run type-check 2>&1 | grep -q "src/clients/factory.ts" && echo "Factory compiles"`

### Task 3: CREATE src/clients/codex.ts - CodexClient implementation

- **IMPLEMENT**: Full IAssistantClient implementation using Codex SDK
- **PATTERN**: Mirror ClaudeClient structure (src/clients/claude.ts:20-110)
- **IMPORTS**:
  ```typescript
  import { Codex } from '@openai/codex-sdk';
  import { IAssistantClient, MessageChunk } from '../types';
  ```
- **CRITICAL IMPLEMENTATION DETAILS**:

  **1. Thread Creation (Synchronous!):**
  ```typescript
  // From .agents/examples/codex-telegram-bot/dist/codex/client.js:25-29
  const codex = new Codex();
  const thread = codex.startThread({
    workingDirectory: cwd,
    skipGitRepoCheck: true
  }); // NOT async!
  ```

  **2. Thread Resumption (Must Pass Options!):**
  ```typescript
  // From .agents/examples/codex-telegram-bot/dist/codex/client.js:42-45
  const thread = codex.resumeThread(resumeSessionId, {
    workingDirectory: cwd,
    skipGitRepoCheck: true
  }); // Options required even when resuming!
  ```

  **3. Event Streaming with Critical Break:**
  ```typescript
  // From .agents/examples/codex-telegram-bot/dist/bot/handlers/message.js:74-134
  const result = await thread.runStreamed(prompt);
  for await (const event of result.events) {
    if (event.type === 'item.completed') {
      // Process event
    }
    if (event.type === 'turn.completed') {
      yield { type: 'result', sessionId: thread.id };
      break; // CRITICAL! Without this = 90-second timeout
    }
  }
  ```

  **4. Event Type Mapping:**
  ```typescript
  // From .agents/examples/codex-telegram-bot/dist/codex/events.js:13-48
  if (event.type === 'item.completed') {
    switch (event.item.type) {
      case 'agent_message':
        if (event.item.text) {
          yield { type: 'assistant', content: event.item.text };
        }
        break;
      case 'command_execution':
        if (event.item.command) {
          yield { type: 'tool', toolName: event.item.command };
        }
        break;
      case 'reasoning':
        if (event.item.text) {
          yield { type: 'thinking', content: event.item.text };
        }
        break;
    }
  }
  ```

- **GOTCHA**:
  - Codex uses threads (not sessions) - store thread.id as assistant_session_id
  - startThread/resumeThread are synchronous, runStreamed is async
  - MUST break on turn.completed to avoid timeout
  - skipGitRepoCheck: true is required to avoid permission errors

- **VALIDATE**: `npm run type-check 2>&1 | grep "src/clients/codex.ts" && npm run lint src/clients/codex.ts`

### Task 4: UPDATE src/types/index.ts - Add Codex-specific types if needed

- **IMPLEMENT**: Review if MessageChunk type supports all Codex event types
- **PATTERN**: Existing MessageChunk interface (src/types/index.ts:79-88)
- **GOTCHA**: Codex has 'reasoning' type (thinking) - verify MessageChunk.type union includes it
- **VALIDATE**: `grep -q "thinking" src/types/index.ts && echo "Types support Codex events"`

### Task 5: UPDATE src/db/codebases.ts - Add ai_assistant_type parameter to createCodebase

- **IMPLEMENT**: Add optional ai_assistant_type parameter defaulting to 'claude'
- **PATTERN**: Existing createCodebase function (src/db/codebases.ts:7-17)
- **IMPLEMENTATION**:
  ```typescript
  export async function createCodebase(data: {
    name: string;
    repository_url?: string;
    default_cwd: string;
    ai_assistant_type?: string; // NEW: defaults to 'claude'
  }): Promise<Codebase> {
    const assistantType = data.ai_assistant_type || 'claude';
    const result = await pool.query<Codebase>(
      'INSERT INTO remote_agent_codebases (name, repository_url, default_cwd, ai_assistant_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.name, data.repository_url || null, data.default_cwd, assistantType]
    );
    return result.rows[0];
  }
  ```
- **VALIDATE**: `npm run type-check && echo "Codebase DB operations compile"`

### Task 6: UPDATE src/db/conversations.ts - Inherit ai_assistant_type from codebase

- **IMPLEMENT**: Modify getOrCreateConversation to look up codebase and use its ai_assistant_type
- **PATTERN**: Existing getOrCreateConversation (src/db/conversations.ts:7-26)
- **IMPLEMENTATION**:
  ```typescript
  export async function getOrCreateConversation(
    platformType: string,
    platformId: string,
    codebaseId?: string // NEW: optional codebase for assistant type lookup
  ): Promise<Conversation> {
    const existing = await pool.query<Conversation>(
      'SELECT * FROM remote_agent_conversations WHERE platform_type = $1 AND platform_conversation_id = $2',
      [platformType, platformId]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    // Determine assistant type
    let assistantType = process.env.DEFAULT_AI_ASSISTANT || 'claude';
    if (codebaseId) {
      const codebase = await pool.query<{ ai_assistant_type: string }>(
        'SELECT ai_assistant_type FROM remote_agent_codebases WHERE id = $1',
        [codebaseId]
      );
      if (codebase.rows[0]) {
        assistantType = codebase.rows[0].ai_assistant_type;
      }
    }

    const created = await pool.query<Conversation>(
      'INSERT INTO remote_agent_conversations (platform_type, platform_conversation_id, ai_assistant_type) VALUES ($1, $2, $3) RETURNING *',
      [platformType, platformId, assistantType]
    );

    return created.rows[0];
  }
  ```
- **GOTCHA**: Conversation's ai_assistant_type is locked after creation (cannot change)
- **VALIDATE**: `npm run type-check && echo "Conversation DB operations compile"`

### Task 7: UPDATE src/db/sessions.ts - Use conversation's ai_assistant_type

- **IMPLEMENT**: Add ai_assistant_type parameter to createSession, remove hardcoded 'claude'
- **PATTERN**: Existing createSession (src/db/sessions.ts:15-25)
- **IMPLEMENTATION**:
  ```typescript
  export async function createSession(data: {
    conversation_id: string;
    codebase_id?: string;
    assistant_session_id?: string;
    ai_assistant_type: string; // NEW: required parameter from conversation
  }): Promise<Session> {
    const result = await pool.query<Session>(
      'INSERT INTO remote_agent_sessions (conversation_id, codebase_id, ai_assistant_type, assistant_session_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.conversation_id, data.codebase_id || null, data.ai_assistant_type, data.assistant_session_id || null]
    );
    return result.rows[0];
  }
  ```
- **GOTCHA**: Remove hardcoded 'claude' from line 22
- **VALIDATE**: `grep -v "claude" src/db/sessions.ts | grep -q "ai_assistant_type" && echo "Hardcoded claude removed"`

### Task 8: UPDATE src/handlers/command-handler.ts - Auto-detect assistant type in /clone

- **IMPLEMENT**: Detect .codex folder and suggest codex assistant when cloning
- **PATTERN**: Existing /clone command (src/handlers/command-handler.ts:101-164)
- **IMPLEMENTATION**: After successful clone (around line 140), add:
  ```typescript
  // Auto-detect assistant type based on folder structure
  let suggestedAssistant = 'claude';
  const codexFolder = join(repoPath, '.codex');
  const claudeFolder = join(repoPath, '.claude');

  try {
    await access(codexFolder);
    suggestedAssistant = 'codex';
  } catch {
    try {
      await access(claudeFolder);
      suggestedAssistant = 'claude';
    } catch {
      // Default to claude
    }
  }

  // Pass suggestedAssistant to createCodebase
  const codebase = await codebaseDb.createCodebase({
    name: repoName,
    repository_url: repoUrl,
    default_cwd: repoPath,
    ai_assistant_type: suggestedAssistant
  });
  ```
- **GOTCHA**: Must import access from 'fs/promises'
- **VALIDATE**: `npm run type-check && grep -q "ai_assistant_type" src/handlers/command-handler.ts`

### Task 9: REFACTOR src/orchestrator/orchestrator.ts - Use client factory

- **IMPLEMENT**: Remove aiClient parameter, dynamically instantiate client based on conversation.ai_assistant_type
- **PATTERN**: Existing handleMessage signature (src/orchestrator/orchestrator.ts:15-21)
- **IMPORTS**: Add `import { getAssistantClient } from '../clients/factory';`
- **IMPLEMENTATION**:
  ```typescript
  export async function handleMessage(
    platform: IPlatformAdapter,
    // REMOVE: aiClient: IAssistantClient parameter
    conversationId: string,
    message: string,
    issueContext?: string
  ): Promise<void> {
    try {
      console.log(`[Orchestrator] Handling message for conversation ${conversationId}`);

      // Get or create conversation
      let conversation = await db.getOrCreateConversation(platform.getPlatformType(), conversationId);

      // ADDED: Dynamically get appropriate client
      const aiClient = getAssistantClient(conversation.ai_assistant_type);

      // ... rest of function unchanged
  ```
- **GOTCHA**: Update session creation calls to pass conversation.ai_assistant_type (around line 128, 135)
  ```typescript
  session = await sessionDb.createSession({
    conversation_id: conversation.id,
    codebase_id: conversation.codebase_id,
    ai_assistant_type: conversation.ai_assistant_type // ADD THIS
  });
  ```
- **VALIDATE**: `npm run type-check && echo "Orchestrator refactored successfully"`

### Task 10: UPDATE src/index.ts - Remove hardcoded ClaudeClient instantiation

- **IMPLEMENT**: Remove Claude instantiation, update handleMessage calls, update env validation
- **PATTERN**: Existing main function (src/index.ts:18-207)
- **CHANGES**:
  1. **Remove lines 47-48**: Delete `const claude = new ClaudeClient();`
  2. **Update credential validation (lines 30-36)**:
     ```typescript
     // Validate AI assistant credentials (warn if missing, don't fail)
     const hasClaudeCredentials = process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;
     const hasCodexCredentials = process.env.CODEX_ID_TOKEN && process.env.CODEX_ACCESS_TOKEN;

     if (!hasClaudeCredentials && !hasCodexCredentials) {
       console.error('[App] No AI assistant credentials found. Set Claude or Codex credentials.');
       process.exit(1);
     }

     if (!hasClaudeCredentials) {
       console.warn('[App] Claude credentials not found. Claude assistant will be unavailable.');
     }
     if (!hasCodexCredentials) {
       console.warn('[App] Codex credentials not found. Codex assistant will be unavailable.');
     }
     ```
  3. **Remove claude parameter from handleMessage calls**:
     - Line 85: `github.handleWebhook(payload, signature).catch(...`
     - Line 140: `await handleMessage(testAdapter, conversationId, message);`
     - Line 181: `await handleMessage(telegram, conversationId, message);`

- **GOTCHA**: GitHub adapter handleWebhook also needs claude parameter removed (see next task)
- **VALIDATE**: `npm run build && echo "Application compiles without hardcoded client"`

### Task 11: UPDATE src/adapters/github.ts - Remove aiClient parameter from handleWebhook

- **IMPLEMENT**: Remove IAssistantClient parameter from handleWebhook signature
- **PATTERN**: Existing handleWebhook (src/adapters/github.ts:133-262)
- **IMPLEMENTATION**:
  ```typescript
  // Line 133 - Update signature
  async handleWebhook(
    payload: string,
    signature: string
    // REMOVE: , aiClient: IAssistantClient parameter
  ): Promise<void> {
    // ... verification logic unchanged ...

    // Line 243 - Update handleMessage call
    await handleMessage(
      this,
      // REMOVE: aiClient,
      conversationId,
      event.comment.body,
      issueContext
    );
  }
  ```
- **VALIDATE**: `npm run type-check && grep -q "handleWebhook" src/adapters/github.ts`

### Task 12: ADD Codex environment variables to .env.example

- **IMPLEMENT**: Add all required Codex credentials and default assistant variable
- **PATTERN**: Existing .env.example structure
- **IMPLEMENTATION**: Add after existing CLAUDE variables:
  ```env
  # Codex Authentication (get from ~/.codex/auth.json after running 'codex login')
  # Required if using Codex as AI assistant
  CODEX_ID_TOKEN=eyJ...
  CODEX_ACCESS_TOKEN=eyJ...
  CODEX_REFRESH_TOKEN=rt_...
  CODEX_ACCOUNT_ID=6a6a7ba6-...

  # Default AI Assistant (claude | codex)
  # Used for new conversations when no codebase specified
  DEFAULT_AI_ASSISTANT=claude
  ```
- **VALIDATE**: `grep -q "CODEX_ID_TOKEN" .env.example && echo "Codex env vars documented"`

### Task 13: UPDATE README.md - Document Codex setup

- **IMPLEMENT**: Add section on getting Codex credentials and using both assistants
- **PATTERN**: Existing README structure (after "Get Claude Authentication" section)
- **IMPLEMENTATION**: Add new section:
  ```markdown
  ### 3. Get Codex Authentication (Optional)

  If you want to use Codex as your AI assistant:

  ```bash
  # Login to Codex CLI
  codex login

  # Copy credentials from auth file
  # On Linux/Mac:
  cat ~/.codex/auth.json

  # On Windows:
  type %USERPROFILE%\.codex\auth.json

  # Copy the values to your .env file:
  # - idToken → CODEX_ID_TOKEN
  # - accessToken → CODEX_ACCESS_TOKEN
  # - refreshToken → CODEX_REFRESH_TOKEN
  # - accountId → CODEX_ACCOUNT_ID
  ```

  ### Using Multiple AI Assistants

  - **Claude**: Default assistant, works with `.claude/commands/` folders
  - **Codex**: Auto-detected when cloning repos with `.codex/` folders
  - **Switching**: Assistant type is set per codebase and locked at conversation start
  - **Environment Default**: Set `DEFAULT_AI_ASSISTANT=codex` to prefer Codex for new conversations
  ```
- **VALIDATE**: `grep -q "Codex Authentication" README.md && echo "README updated"`

### Task 14: CREATE src/clients/codex.test.ts - Unit tests for CodexClient

- **IMPLEMENT**: Unit tests mirroring claude.test.ts structure
- **PATTERN**: Existing test placeholder (src/clients/claude.test.ts)
- **IMPLEMENTATION**:
  ```typescript
  /**
   * Unit tests for Codex client
   */
  import { CodexClient } from './codex';

  describe('CodexClient', () => {
    it('should implement IAssistantClient interface', () => {
      const client = new CodexClient();
      expect(client.getType()).toBe('codex');
    });

    it('should handle thread creation', async () => {
      // Integration test - requires valid Codex credentials
      // Skip in CI without CODEX_ID_TOKEN
      if (!process.env.CODEX_ID_TOKEN) {
        console.log('Skipping Codex integration test - no credentials');
        return;
      }

      const client = new CodexClient();
      const cwd = process.cwd();

      // Test basic query
      const generator = client.sendQuery('echo test', cwd);
      const firstMessage = await generator.next();

      expect(firstMessage.done).toBe(false);
    });

    // TODO: Add comprehensive tests with mocked SDK
    // - Thread resumption
    // - Event mapping (item.completed → MessageChunk)
    // - turn.completed handling
    // - Error scenarios
  });
  ```
- **GOTCHA**: Tests require valid Codex credentials or SDK mocking
- **VALIDATE**: `npm test -- src/clients/codex.test.ts`

### Task 15: VALIDATE End-to-end with test adapter - Claude assistant

- **IMPLEMENT**: Test default Claude assistant still works
- **PATTERN**: Test adapter usage (README.md:677-718)
- **COMMANDS**:
  ```bash
  # Start application
  docker-compose up -d

  # Test Claude (default)
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d '{"conversationId":"test-claude","message":"hello"}'

  # Verify response uses Claude
  curl http://localhost:3000/test/messages/test-claude | jq '.messages[0].content'

  # Check conversation AI type in database
  docker-compose exec postgres psql -U postgres -d remote_coding_agent \
    -c "SELECT id, ai_assistant_type FROM remote_agent_conversations WHERE platform_conversation_id = 'test-claude';"
  ```
- **EXPECTED**: ai_assistant_type = 'claude'
- **VALIDATE**: `echo "Claude assistant validated via test adapter"`

### Task 16: VALIDATE End-to-end with test adapter - Codex assistant

- **IMPLEMENT**: Create codebase with Codex, verify conversation inherits it
- **PATTERN**: Test adapter + database queries
- **COMMANDS**:
  ```bash
  # Insert Codex codebase
  docker-compose exec postgres psql -U postgres -d remote_coding_agent <<EOF
  INSERT INTO remote_agent_codebases (id, name, default_cwd, ai_assistant_type)
  VALUES ('test-codex-id', 'test-codex-repo', '/workspace/test', 'codex');
  EOF

  # Update test conversation to use Codex codebase
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d '{"conversationId":"test-codex","message":"hello"}'

  # Verify uses Codex (requires CODEX_* env vars)
  docker-compose exec postgres psql -U postgres -d remote_coding_agent \
    -c "SELECT c.id, c.ai_assistant_type, s.ai_assistant_type as session_type FROM remote_agent_conversations c LEFT JOIN remote_agent_sessions s ON s.conversation_id = c.id WHERE c.platform_conversation_id = 'test-codex';"
  ```
- **EXPECTED**: Both conversation and session have ai_assistant_type = 'codex'
- **VALIDATE**: `echo "Codex assistant validated via test adapter"`

### Task 17: VALIDATE Assistant type cannot change mid-conversation

- **IMPLEMENT**: Attempt to change conversation's ai_assistant_type, verify it's locked
- **COMMANDS**:
  ```bash
  # Try to update ai_assistant_type (should be ignored or error)
  docker-compose exec postgres psql -U postgres -d remote_coding_agent \
    -c "UPDATE remote_agent_conversations SET ai_assistant_type = 'codex' WHERE platform_conversation_id = 'test-claude'; SELECT ai_assistant_type FROM remote_agent_conversations WHERE platform_conversation_id = 'test-claude';"

  # Verify existing session still uses original assistant
  docker-compose exec postgres psql -U postgres -d remote_coding_agent \
    -c "SELECT ai_assistant_type FROM remote_agent_sessions WHERE conversation_id = (SELECT id FROM remote_agent_conversations WHERE platform_conversation_id = 'test-claude');"
  ```
- **EXPECTED**: Sessions maintain original assistant type even if conversation field changes
- **GOTCHA**: This test validates database isolation, not application logic (application shouldn't allow updates)
- **VALIDATE**: `echo "Assistant type locking validated"`

---

## TESTING STRATEGY

### Unit Tests

**Scope**: Client implementations, factory function, database operations

**Framework**: Jest with ts-jest preset (existing configuration in jest.config.js)

**Key Test Cases**:
- CodexClient implements IAssistantClient correctly
- Factory returns correct client for 'claude' and 'codex'
- Factory throws error for unknown assistant types
- Database functions handle ai_assistant_type parameters
- Event mapping from Codex events to MessageChunk

**Mocking Strategy**:
- Mock `@openai/codex-sdk` to avoid real API calls
- Mock database pool for DB operation tests
- Use fixtures for Codex event stream examples

### Integration Tests

**Scope**: End-to-end assistant selection flow

**Test Scenarios**:
1. **Default Claude**: New conversation without codebase uses Claude (env default)
2. **Codebase Inheritance**: Conversation with Codex codebase uses Codex
3. **Session Consistency**: All sessions in conversation use same assistant type
4. **Auto-detection**: /clone with .codex folder creates Codex codebase

**Test Method**: Test adapter endpoints (`POST /test/message`, `GET /test/messages/:id`)

**Validation**: Database queries to verify ai_assistant_type propagation

### Edge Cases

1. **Missing Credentials**: Claude conversation when only Codex credentials present (should fail gracefully with error message)
2. **Thread Resume Failure**: Codex thread.id invalid (should create new thread)
3. **Event Stream Error**: Codex streaming error mid-response (should log and attempt recovery)
4. **Concurrent Sessions**: Multiple conversations with different assistants simultaneously
5. **Codebase Switch**: Changing codebase mid-conversation (assistant type should NOT change)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking (must pass with 0 errors)
npm run type-check

# ESLint (must pass with 0 errors)
npm run lint

# Prettier formatting check (must pass with 0 errors)
npm run format:check
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

```bash
# Run all tests
npm test

# Run with coverage (should maintain or improve coverage)
npm test -- --coverage

# Test specific files
npm test -- src/clients/codex.test.ts
npm test -- src/clients/claude.test.ts
```

**Expected**: All tests pass, no regressions in existing test suite

### Level 3: Build

```bash
# Build TypeScript
npm run build

# Verify dist/ output includes new files
ls -la dist/clients/codex.js
ls -la dist/clients/factory.js

# Verify application starts without errors
node dist/index.js
```

**Expected**: Clean build, application starts and validates credentials

### Level 4: Manual Validation (Test Adapter)

```bash
# Start application with Docker
docker-compose up -d

# Test Claude assistant (default)
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-claude-validation","message":"echo Hello from Claude"}'

curl http://localhost:3000/test/messages/test-claude-validation | jq

# Test Codex assistant (requires CODEX_* env vars in .env)
# First create Codex codebase in database
docker-compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "INSERT INTO remote_agent_codebases (id, name, default_cwd, ai_assistant_type) VALUES ('codex-test-cb', 'codex-test', '/workspace/test', 'codex');"

# Send message and verify Codex is used
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-codex-validation","message":"echo Hello from Codex"}'

curl http://localhost:3000/test/messages/test-codex-validation | jq

# Verify assistant types in database
docker-compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT platform_conversation_id, ai_assistant_type FROM remote_agent_conversations WHERE platform_conversation_id LIKE 'test-%';"
```

**Expected**:
- Claude conversation shows ai_assistant_type = 'claude'
- Codex conversation shows ai_assistant_type = 'codex'
- Both return appropriate responses
- Sessions match conversation assistant types

### Level 5: Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Database connectivity
curl http://localhost:3000/health/db

# Concurrency manager stats
curl http://localhost:3000/health/concurrency
```

**Expected**: All health checks return {"status":"ok"}

---

## ACCEPTANCE CRITERIA

- [x] CodexClient implements IAssistantClient interface completely
- [x] Factory pattern correctly routes to Claude or Codex based on type string
- [x] Conversation creation inherits ai_assistant_type from codebase (or env default)
- [x] Session creation uses conversation's ai_assistant_type (no hardcoded 'claude')
- [x] /clone command auto-detects .codex folder and creates Codex codebase
- [x] Orchestrator dynamically selects client via factory (no hardcoded client parameter)
- [x] Main entry point removed hardcoded ClaudeClient instantiation
- [x] Environment validation supports both Claude and Codex credentials
- [x] Test adapter successfully creates conversations with both assistants
- [x] Database queries show correct ai_assistant_type propagation (codebase → conversation → session)
- [x] All validation commands pass with zero errors (type-check, lint, format:check)
- [x] Unit tests cover CodexClient event mapping and thread management
- [x] Build succeeds and application starts without errors
- [x] No regressions in existing Claude functionality
- [x] README and .env.example document Codex setup

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (Tasks 1-17)
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: type-check (0 errors), lint (0 errors), format:check (pass)
  - [ ] Level 2: npm test (all pass), coverage maintained/improved
  - [ ] Level 3: npm run build (success), dist/ contains codex.js and factory.js
  - [ ] Level 4: Test adapter validates both Claude and Codex conversations
  - [ ] Level 5: All health checks return {"status":"ok"}
- [ ] Full test suite passes (unit + integration)
- [ ] No linting errors
- [ ] No formatting errors
- [ ] No type checking errors
- [ ] Build succeeds
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability
- [ ] Codex example patterns correctly implemented (thread model, event mapping, turn.completed break)
- [ ] Assistant type locking verified (cannot change mid-conversation)
- [ ] Both assistants work simultaneously in different conversations

---

## NOTES

**Critical Implementation Details:**

1. **Codex SDK Synchronous Operations**: Unlike Claude SDK's async `query()`, Codex's `startThread()` and `resumeThread()` are synchronous. Do NOT await them.

2. **Turn Completion Break**: The event loop MUST break on `turn.completed` or you'll hit a 90-second timeout. This is documented in the Codex example but easy to miss.

3. **Thread Options Required**: When resuming a Codex thread, you MUST pass the same options (workingDirectory, skipGitRepoCheck) or it will fail.

4. **Assistant Type Locking**: Once a conversation is created with an ai_assistant_type, it should never change. Sessions inherit from conversations, and all sessions in a conversation must use the same assistant.

5. **Environment Variable Priority**: DEFAULT_AI_ASSISTANT env var is fallback when no codebase specified. Codebase ai_assistant_type takes precedence.

**Design Decisions:**

- **Factory Pattern**: Chosen over dependency injection for simplicity. Orchestrator doesn't need to manage client lifecycle.
- **Auto-detection**: .codex folder presence triggers Codex selection during /clone. Overridable by explicit codebase configuration.
- **Graceful Degradation**: If Codex credentials missing but Codex conversation requested, fail with clear error message (don't silently fallback to Claude).
- **No Migration Needed**: Existing conversations with NULL ai_assistant_type will use database default ('claude'). No data migration required.

**Trade-offs:**

- **No Runtime Assistant Switching**: Decided against allowing mid-conversation assistant changes to avoid session compatibility issues. PRD explicitly forbids this.
- **Singleton Codex Instance**: Following the example pattern of singleton Codex client. Could be made instance-based if needed for multiple accounts.
- **Thread ID Storage**: Storing Codex thread.id in assistant_session_id field (designed for Claude session IDs). Works because both are strings, but semantically different.

**Future Enhancements:**

- Token refresh for Codex credentials (example doesn't show this)
- Assistant-specific configuration (different MCP servers per assistant)
- Per-user assistant preferences (if multi-user support added)
- Assistant performance metrics and cost tracking
