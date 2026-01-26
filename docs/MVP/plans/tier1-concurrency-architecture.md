# Feature: Tier 1 Concurrency Architecture (Fire-and-Forget Pattern)

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Implement non-blocking concurrent conversation handling using a conversation lock manager. This architecture enables the platform to process multiple AI conversations simultaneously (up to 10 concurrent) instead of the current blocking single-threaded approach. The solution is completely adapter-agnostic and works seamlessly with any platform (Telegram, Slack, GitHub) and any AI client (Claude, Codex).

The implementation uses an in-memory lock manager that:
- Allows up to N concurrent conversations globally (configurable, default 10)
- Ensures per-conversation ordering (one message at a time per conversation)
- Queues messages when at capacity or conversation already active
- Provides observability via health check endpoints
- Preserves all existing logging and error handling

This is a **Tier 1 implementation** - simple, zero external dependencies, production-ready for single-process deployments.

## User Story

As a developer using the Remote Coding Agent platform
I want multiple users to interact with AI assistants simultaneously without blocking each other
So that User A's 60-second conversation doesn't force User B to wait before starting their conversation

## Problem Statement

**Current Blocking Architecture:**
The application currently processes messages sequentially due to blocking `await` calls in event handlers (src/index.ts:109-116). When User A sends a message that takes 60 seconds to process, all subsequent messages from any user are queued in the platform adapter's event loop with zero visibility or control.

**Specific Issues:**
1. **Poor user experience**: Users wait unnecessarily for other users' conversations to complete
2. **Hidden queuing**: No visibility into how many messages are queued or which conversations are active
3. **Resource waste**: System processes 1 conversation at a time despite having capacity for 10+
4. **No concurrency limits**: Event loop can accumulate unlimited messages, risking memory exhaustion
5. **False simplicity**: Current code appears simple but hides complexity in platform adapter internals

**Evidence from codebase:**
```typescript
// src/index.ts:109-116 - BLOCKING CALL
telegram.getBot().on('text', async (ctx) => {
  const conversationId = telegram.getConversationId(ctx);
  const message = ctx.message.text;

  if (message) {
    await handleMessage(telegram, claude, conversationId, message); // ← BLOCKS HERE
  }
});
```

This `await` prevents the event handler from returning, blocking all subsequent Telegram message processing.

## Solution Statement

Implement a **ConversationLockManager** utility that wraps the existing `handleMessage()` function with non-blocking concurrency control. The lock manager:

1. **Fire-and-Forget Execution**: Event handlers return immediately, processing happens async
2. **Per-Conversation Locking**: Same conversation processes one message at a time (prevents race conditions)
3. **Global Concurrency Limit**: Maximum N concurrent conversations (prevents resource exhaustion)
4. **Explicit Queuing**: Messages queue when at capacity, with full visibility
5. **Platform-Agnostic**: Works with any `IPlatformAdapter` and `IAssistantClient` implementation

**Key Design Decision**: The lock manager operates at the orchestrator layer, treating all adapters and AI clients uniformly. It only cares about:
- `conversationId` (opaque string, platform-agnostic)
- `handler` function (async operation, content-agnostic)

## Feature Metadata

**Feature Type**: Enhancement (Infrastructure)
**Estimated Complexity**: Low-Medium
**Primary Systems Affected**:
- Entry point (src/index.ts) - Handler refactoring
- New utility (src/utils/conversation-lock.ts) - Lock manager implementation
- Health checks (src/index.ts) - New concurrency endpoint
- Environment config (.env.example) - New MAX_CONCURRENT variable

**Dependencies**: None (in-memory implementation, zero external packages)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/index.ts` (lines 109-116) - **Why**: Current blocking handler pattern that needs refactoring
- `src/index.ts` (lines 55-66) - **Why**: Health check pattern to mirror for concurrency endpoint
- `src/orchestrator/orchestrator.ts` (lines 15-20) - **Why**: Generic `handleMessage()` signature - lock manager wraps this
- `src/types/index.ts` (lines 49-69) - **Why**: `IPlatformAdapter` interface - shows adapter abstraction
- `src/types/index.ts` (lines 88-105) - **Why**: `IAssistantClient` interface - shows AI client abstraction
- `src/adapters/telegram.ts` (lines 10-22) - **Why**: Platform adapter implementation example
- `src/adapters/test.ts` (entire file) - **Why**: Test adapter for validation without Telegram
- `src/db/connection.ts` (lines 6-11) - **Why**: Connection pool already configured for concurrency (max: 10)
- `src/utils/variable-substitution.ts` (entire file) - **Why**: Existing utility pattern to mirror
- `src/utils/variable-substitution.test.ts` (entire file) - **Why**: Test pattern for new utility
- `CLAUDE.md` (lines 337-371) - **Why**: Logging patterns and structured console.log format
- `.env.example` (entire file) - **Why**: Environment variable pattern to follow

### New Files to Create

- `src/utils/conversation-lock.ts` - ConversationLockManager class implementation
- `src/utils/conversation-lock.test.ts` - Unit tests for lock manager

### Relevant Documentation - YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Node.js Async Patterns](https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking)
  - Specific section: Non-blocking I/O and async operations
  - Why: Understanding fire-and-forget pattern and Promise handling

- [TypeScript Promises and Async](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-1-7.html#asyncawait)
  - Specific section: Async/await and Promise management
  - Why: Proper typing for async handlers and error boundaries

- [Map Data Structure](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
  - Specific section: Map methods and iteration
  - Why: Lock manager uses Map for O(1) conversation lookups

### Patterns to Follow

**Logging Pattern** (from CLAUDE.md:337-371, src/index.ts:17,39,41):
```typescript
// Structured logging with module prefix and context
console.log('[Module] Event description', {
  key: value,
  timestamp: new Date().toISOString()
});

// Error logging with context
console.error('[Module] Error description:', error);
```

**Utility Module Pattern** (from src/utils/variable-substitution.ts:14-33):
```typescript
/**
 * JSDoc describing function purpose
 * @param paramName - Description
 * @returns Description
 */
export function utilityFunction(
  param1: string,
  param2: number
): ReturnType {
  // Implementation
}
```

**Class Pattern** (from src/adapters/telegram.ts:10-22):
```typescript
export class ClassName {
  private privateField: Type;
  private anotherField: Type;

  constructor(param: Type) {
    this.privateField = param;
    console.log('[ClassName] Initialized', { config: param });
  }

  public publicMethod(): ReturnType {
    // Implementation with logging
    console.log('[ClassName] Method called');
  }
}
```

**Test Pattern** (from src/utils/variable-substitution.test.ts:3-12):
```typescript
import { functionToTest } from './module';

describe('ModuleName', () => {
  test('should do expected behavior', () => {
    const result = functionToTest('input');
    expect(result).toBe('expected');
  });

  test('should handle edge case', () => {
    const result = functionToTest('edge-input');
    expect(result).toBe('edge-output');
  });
});
```

**Health Check Pattern** (from src/index.ts:55-66):
```typescript
app.get('/health/feature', async (_req, res) => {
  try {
    // Check feature status
    res.json({ status: 'ok', featureData: data });
  } catch (error) {
    res.status(500).json({ status: 'error', reason: 'description' });
  }
});
```

**Environment Variable Pattern** (from .env.example:1-27):
```env
# Section Comment
VARIABLE_NAME=default_value  # Inline comment explaining usage
```

**Error Handling in Async Operations** (from src/orchestrator/orchestrator.ts:174-180):
```typescript
try {
  // Operation
} catch (error) {
  console.error('[Module] Error:', error);
  await platform.sendMessage(conversationId, '⚠️ Error message');
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Lock Manager Foundation

Create the core ConversationLockManager utility with per-conversation locking and global concurrency limits.

**Tasks:**
- Implement ConversationLockManager class with Map-based state tracking
- Add acquireLock method for non-blocking execution
- Implement queueing logic for overload scenarios
- Add comprehensive logging for observability

### Phase 2: Integration with Handlers

Update existing event handlers to use fire-and-forget pattern with lock manager.

**Tasks:**
- Refactor Telegram handler to non-blocking
- Refactor Test adapter handler to non-blocking
- Ensure error handling preserved
- Maintain all existing logging

### Phase 3: Observability

Add health check endpoints and statistics tracking for concurrency monitoring.

**Tasks:**
- Implement getStats method on lock manager
- Add /health/concurrency endpoint
- Add environment variable for max concurrent limit
- Update .env.example with documentation

### Phase 4: Testing & Validation

Comprehensive testing of concurrent behavior, edge cases, and integration with existing functionality.

**Tasks:**
- Write unit tests for lock manager
- Add integration tests via test adapter
- Validate concurrent message handling
- Confirm all existing tests still pass

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: CREATE src/utils/conversation-lock.ts

- **IMPLEMENT**: ConversationLockManager class with TypeScript interfaces and JSDoc
- **PATTERN**: Class structure from src/adapters/telegram.ts:10-22
- **PATTERN**: Logging from CLAUDE.md:337-371 (structured console.log)
- **IMPORTS**: None required (use built-in Map, Promise)
- **STRUCTURE**:
  ```typescript
  interface QueuedMessage {
    handler: () => Promise<void>;
    timestamp: number;
  }

  export class ConversationLockManager {
    private activeConversations: Map<string, Promise<void>>;
    private messageQueues: Map<string, QueuedMessage[]>;
    private maxConcurrent: number;

    constructor(maxConcurrent: number = 10)
    async acquireLock(conversationId: string, handler: () => Promise<void>): Promise<void>
    private queueMessage(conversationId: string, handler: () => Promise<void>): void
    private async processQueue(conversationId: string): Promise<void>
    getStats(): object
  }
  ```
- **GOTCHA**: Must track both active conversations (Map<string, Promise>) and queued messages (Map<string, Array>)
- **GOTCHA**: Use .finally() to ensure cleanup happens even on error
- **GOTCHA**: Check conversation-specific lock FIRST, then global capacity
- **VALIDATE**: `npx tsc --noEmit` (should compile without errors)

### Task 2: IMPLEMENT ConversationLockManager.constructor

- **IMPLEMENT**: Initialize Maps and set maxConcurrent with logging
- **PATTERN**: Constructor logging from src/adapters/telegram.ts:14-22
- **CODE**:
  ```typescript
  constructor(maxConcurrent: number = 10) {
    this.activeConversations = new Map<string, Promise<void>>();
    this.messageQueues = new Map<string, QueuedMessage[]>();
    this.maxConcurrent = maxConcurrent;
    console.log('[ConversationLock] Initialized', { maxConcurrent });
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 3: IMPLEMENT ConversationLockManager.acquireLock (core logic)

- **IMPLEMENT**: Non-blocking lock acquisition with queuing fallback
- **PATTERN**: Async error handling from src/orchestrator/orchestrator.ts:174-180
- **LOGIC**:
  1. Check if conversation already active → queue if yes
  2. Check if at max capacity → queue if yes
  3. Otherwise: execute immediately with Promise tracking
  4. Use .finally() to clean up and process queue
- **LOGGING**:
  ```typescript
  console.log(`[ConversationLock] Starting ${conversationId}`, {
    active: this.activeConversations.size + 1,
    queued: this.getQueuedCount()
  });
  ```
- **GOTCHA**: Store Promise in Map BEFORE awaiting handler (prevents race conditions)
- **GOTCHA**: Delete from Map in .finally(), not .then() (ensures cleanup on error)
- **VALIDATE**: `npx tsc --noEmit`

### Task 4: IMPLEMENT ConversationLockManager.queueMessage

- **IMPLEMENT**: Add message to per-conversation queue with timestamp
- **PATTERN**: Map operations with null-checking
- **CODE**:
  ```typescript
  private queueMessage(conversationId: string, handler: () => Promise<void>): void {
    if (!this.messageQueues.has(conversationId)) {
      this.messageQueues.set(conversationId, []);
    }
    this.messageQueues.get(conversationId)!.push({
      handler,
      timestamp: Date.now()
    });
    console.log(`[ConversationLock] Queued message for ${conversationId}`, {
      queueLength: this.messageQueues.get(conversationId)!.length
    });
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 5: IMPLEMENT ConversationLockManager.processQueue

- **IMPLEMENT**: Process next queued message for conversation if any exist
- **PATTERN**: Recursive async call via acquireLock
- **CODE**:
  ```typescript
  private async processQueue(conversationId: string): Promise<void> {
    const queue = this.messageQueues.get(conversationId);
    if (!queue || queue.length === 0) {
      this.messageQueues.delete(conversationId);
      return;
    }

    const next = queue.shift()!;
    const waitTime = Date.now() - next.timestamp;
    console.log(`[ConversationLock] Processing queued message`, {
      conversationId,
      waitTimeMs: waitTime
    });

    await this.acquireLock(conversationId, next.handler);
  }
  ```
- **GOTCHA**: Clean up empty queues (delete from Map) to prevent memory leak
- **VALIDATE**: `npx tsc --noEmit`

### Task 6: IMPLEMENT ConversationLockManager.getStats

- **IMPLEMENT**: Return current state for observability
- **PATTERN**: Health check JSON structure from src/index.ts:59-65
- **CODE**:
  ```typescript
  getStats(): {
    active: number;
    queuedTotal: number;
    queuedByConversation: Array<{ conversationId: string; queuedMessages: number }>;
    maxConcurrent: number;
    activeConversationIds: string[];
  } {
    const queuedByConversation = Array.from(this.messageQueues.entries()).map(
      ([id, queue]) => ({
        conversationId: id,
        queuedMessages: queue.length
      })
    );

    return {
      active: this.activeConversations.size,
      queuedTotal: Array.from(this.messageQueues.values()).reduce(
        (sum, q) => sum + q.length,
        0
      ),
      queuedByConversation,
      maxConcurrent: this.maxConcurrent,
      activeConversationIds: Array.from(this.activeConversations.keys())
    };
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 7: CREATE src/utils/conversation-lock.test.ts

- **IMPLEMENT**: Unit tests for lock manager behavior
- **PATTERN**: Test structure from src/utils/variable-substitution.test.ts:1-12
- **IMPORTS**: `import { ConversationLockManager } from './conversation-lock';`
- **TEST CASES**:
  1. Constructor initializes with correct maxConcurrent
  2. getStats returns empty state initially
  3. acquireLock processes handler immediately when under capacity
  4. acquireLock queues when same conversation already active
  5. acquireLock queues when at max capacity
  6. Multiple conversations process concurrently
  7. Queue processes in order after conversation completes
- **EXAMPLE TEST**:
  ```typescript
  describe('ConversationLockManager', () => {
    test('should process handler immediately when under capacity', async () => {
      const manager = new ConversationLockManager(10);
      let executed = false;

      await manager.acquireLock('test-1', async () => {
        executed = true;
      });

      expect(executed).toBe(true);
      expect(manager.getStats().active).toBe(0); // Completed
    });
  });
  ```
- **GOTCHA**: Use async/await in tests, add small delays to test race conditions
- **VALIDATE**: `npm test -- conversation-lock.test.ts`

### Task 8: UPDATE src/index.ts (import lock manager)

- **IMPLEMENT**: Import ConversationLockManager at top of file
- **PATTERN**: Import grouping from src/index.ts:5-11 (local imports last)
- **LOCATION**: After line 11 (after local imports)
- **ADD**:
  ```typescript
  import { ConversationLockManager } from './utils/conversation-lock';
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 9: UPDATE src/index.ts (instantiate lock manager)

- **IMPLEMENT**: Create lock manager instance after env validation
- **PATTERN**: Client initialization from src/index.ts:44
- **LOCATION**: After line 44 (after `const claude = new ClaudeClient();`)
- **ADD**:
  ```typescript
  // Initialize conversation lock manager
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS || '10');
  const lockManager = new ConversationLockManager(maxConcurrent);
  console.log(`[App] Lock manager initialized (max concurrent: ${maxConcurrent})`);
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 10: UPDATE src/index.ts (refactor Telegram handler)

- **IMPLEMENT**: Replace blocking await with fire-and-forget via lock manager
- **PATTERN**: Keep existing getConversationId and message extraction
- **LOCATION**: Lines 109-116 (telegram.getBot().on('text') handler)
- **REPLACE**:
  ```typescript
  // OLD (blocking)
  telegram.getBot().on('text', async (ctx) => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;

    if (message) {
      await handleMessage(telegram, claude, conversationId, message);
    }
  });
  ```
- **WITH**:
  ```typescript
  // NEW (non-blocking)
  telegram.getBot().on('text', async (ctx) => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;

    if (!message) return;

    // Fire-and-forget: handler returns immediately, processing happens async
    lockManager.acquireLock(conversationId, async () => {
      await handleMessage(telegram, claude, conversationId, message);
    }).catch(error => {
      console.error('[Telegram] Failed to process message:', error);
    });
  });
  ```
- **GOTCHA**: Keep .catch() on acquireLock to prevent unhandled promise rejection
- **GOTCHA**: Return immediately from handler if no message (preserves existing behavior)
- **VALIDATE**: `npx tsc --noEmit`

### Task 11: UPDATE src/index.ts (refactor Test adapter handler)

- **IMPLEMENT**: Replace blocking call with fire-and-forget in test endpoint
- **LOCATION**: Lines 79-81 (handleMessage call in /test/message endpoint)
- **REPLACE**:
  ```typescript
  // OLD (blocking)
  handleMessage(testAdapter, claude, conversationId, message).catch(error => {
    console.error('[Test] Message handling error:', error);
  });
  ```
- **WITH**:
  ```typescript
  // NEW (non-blocking)
  lockManager.acquireLock(conversationId, async () => {
    await handleMessage(testAdapter, claude, conversationId, message);
  }).catch(error => {
    console.error('[Test] Message handling error:', error);
  });
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 12: ADD /health/concurrency endpoint

- **IMPLEMENT**: New health check endpoint for concurrency monitoring
- **PATTERN**: Health check structure from src/index.ts:55-66
- **LOCATION**: After line 66 (after /health/db endpoint)
- **ADD**:
  ```typescript
  app.get('/health/concurrency', (_req, res) => {
    try {
      const stats = lockManager.getStats();
      res.json({
        status: 'ok',
        ...stats
      });
    } catch (error) {
      res.status(500).json({ status: 'error', reason: 'Failed to get stats' });
    }
  });
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 13: UPDATE .env.example

- **IMPLEMENT**: Add MAX_CONCURRENT_CONVERSATIONS environment variable
- **PATTERN**: Environment variable format from .env.example:1-27
- **LOCATION**: After line 27 (after PORT)
- **ADD**:
  ```env
  # Concurrency
  MAX_CONCURRENT_CONVERSATIONS=10  # Maximum concurrent AI conversations (default: 10)
  ```
- **VALIDATE**: File should still be valid .env format

### Task 14: BUILD and check for compilation errors

- **IMPLEMENT**: Run TypeScript compilation to verify all changes
- **COMMAND**: `npm run build`
- **EXPECTED**: No errors, dist/ folder created with compiled .js files
- **GOTCHA**: Fix any type errors before proceeding
- **VALIDATE**: `ls -la dist/` (should show compiled files)

### Task 15: RUN unit tests

- **IMPLEMENT**: Execute Jest test suite to ensure no regressions
- **COMMAND**: `npm test`
- **EXPECTED**: All existing tests pass + new lock manager tests pass
- **GOTCHA**: If variable-substitution tests fail, check imports haven't changed
- **VALIDATE**: Exit code 0, all tests green

### Task 16: START application

- **IMPLEMENT**: Build and run application in Docker to verify runtime behavior
- **COMMANDS**:
  ```bash
  # Build and start with Docker Compose
  docker-compose up -d --build

  # Check logs for initialization
  docker-compose logs -f app
  ```
- **EXPECTED**: Logs show lock manager initialized
- **CHECK FOR**:
  - `[ConversationLock] Initialized { maxConcurrent: 10 }`
  - `[App] Lock manager initialized (max concurrent: 10)`
  - No runtime errors
- **VALIDATE**: Application starts without crashes, container running (`docker-compose ps`)

### Task 17: TEST /health/concurrency endpoint

- **IMPLEMENT**: Verify new health check endpoint returns correct data
- **COMMAND**: `curl http://localhost:3000/health/concurrency | jq`
- **EXPECTED**:
  ```json
  {
    "status": "ok",
    "active": 0,
    "queuedTotal": 0,
    "queuedByConversation": [],
    "maxConcurrent": 10,
    "activeConversationIds": []
  }
  ```
- **VALIDATE**: HTTP 200, valid JSON structure

### Task 18: TEST concurrent message handling (manual)

- **IMPLEMENT**: Send multiple concurrent messages via test adapter
- **COMMANDS** (run in parallel):
  ```bash
  # Send 5 messages to different conversations (fire all at once)
  for i in {1..5}; do
    curl -X POST http://localhost:3000/test/message \
      -H "Content-Type: application/json" \
      -d "{\"conversationId\":\"test-$i\",\"message\":\"What is TypeScript?\"}" &
  done

  # Check concurrency stats immediately
  sleep 2 && curl http://localhost:3000/health/concurrency | jq
  ```
- **EXPECTED**: Health check shows multiple active conversations (1-5 depending on timing)
- **VALIDATE**: Multiple conversations process simultaneously, logs show "[ConversationLock] Starting test-1", "test-2", etc.

### Task 19: TEST per-conversation queueing

- **IMPLEMENT**: Verify same conversation queues subsequent messages
- **COMMANDS**:
  ```bash
  # Send 3 messages to SAME conversation rapidly
  for i in {1..3}; do
    curl -X POST http://localhost:3000/test/message \
      -H "Content-Type: application/json" \
      -d "{\"conversationId\":\"same-conv\",\"message\":\"Message $i\"}" &
  done

  # Check stats
  sleep 1 && curl http://localhost:3000/health/concurrency | jq
  ```
- **EXPECTED**: Health check shows 1 active "same-conv", 2 queued messages for it
- **VALIDATE**: Logs show "[ConversationLock] Queued message for same-conv"

### Task 20: TEST max concurrent limit

- **IMPLEMENT**: Verify global concurrency limit enforced
- **SETUP**: Set `MAX_CONCURRENT_CONVERSATIONS=3` in .env, restart app
- **COMMANDS**:
  ```bash
  # Send 5 messages to different conversations
  for i in {1..5}; do
    curl -X POST http://localhost:3000/test/message \
      -H "Content-Type: application/json" \
      -d "{\"conversationId\":\"conv-$i\",\"message\":\"Test\"}" &
  done

  # Check stats
  sleep 1 && curl http://localhost:3000/health/concurrency | jq
  ```
- **EXPECTED**: Health check shows max 3 active, remaining 2 queued
- **VALIDATE**: Logs show "[ConversationLock] At max capacity (3), queuing conv-4"

### Task 21: TEST error handling preservation

- **IMPLEMENT**: Verify errors still logged and handled correctly
- **COMMAND**: Send message with invalid codebase reference
  ```bash
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d '{"conversationId":"error-test","message":"What is this?"}'
  ```
- **EXPECTED**: Error logged, conversation cleaned up (not stuck in active state)
- **CHECK**: `curl http://localhost:3000/health/concurrency | jq` shows "error-test" not in active list after completion
- **VALIDATE**: Logs show error but lock manager continues functioning

### Task 22: RUN full validation suite

- **IMPLEMENT**: Execute all validation commands to ensure completeness
- **COMMANDS**:
  ```bash
  npm run type-check  # TypeScript compilation
  npm run lint        # ESLint checks
  npm test            # Jest unit tests
  npm run build       # Production build
  ```
- **EXPECTED**: All commands pass with exit code 0
- **VALIDATE**: Zero errors across all checks

---

## TESTING STRATEGY

This is an infrastructure enhancement that changes execution model without modifying business logic. Testing focuses on concurrency behavior, lock correctness, and regression prevention.

### Unit Tests

**Objective**: Verify ConversationLockManager logic in isolation

**Test Cases** (src/utils/conversation-lock.test.ts):
1. **Initialization**: Verify constructor sets maxConcurrent correctly
2. **Immediate execution**: Handler runs immediately when under capacity
3. **Per-conversation locking**: Second message to same conversation queues
4. **Global capacity limit**: (N+1)th conversation queues when N at max
5. **Queue processing**: Queued messages process in order after completion
6. **Concurrent processing**: Multiple different conversations run simultaneously
7. **Error handling**: Errors in handler don't prevent queue processing
8. **Stats accuracy**: getStats returns correct active/queued counts

**Pattern**: Use Jest with async/await, mock handlers with timing control

### Integration Tests

**Objective**: Validate non-blocking behavior with real orchestrator and test adapter

**Approach**: Use test adapter HTTP endpoints (no Telegram required)

**Test Cases**:
1. **Concurrent conversations**: 10 messages to different conversations process simultaneously
2. **Same conversation ordering**: 3 messages to same conversation process sequentially
3. **Mixed scenario**: 5 conversations with 2 messages each, verify ordering per-conversation
4. **Capacity overflow**: Send more than MAX_CONCURRENT, verify queueing
5. **Health check accuracy**: Stats match actual active/queued state during processing

**Validation Method**:
- Use `curl` with `&` (background) for parallel requests
- Check logs for "[ConversationLock] Starting" events
- Poll `/health/concurrency` to verify stats
- Verify all messages eventually process (no dropped messages)

### Edge Cases

**Specific edge cases to validate:**

1. **Rapid-fire messages to same conversation**
   - Send 10 messages to same conversation within 100ms
   - Verify: All 10 process in order, no race conditions
   - Check: Logs show queuing, no duplicate processing

2. **Error in first message doesn't block queue**
   - Send 2 messages to same conversation, first fails with error
   - Verify: Second message still processes after first completes
   - Check: activeConversations Map cleaned up properly

3. **Capacity limit edge (exactly at max)**
   - Set MAX_CONCURRENT=3, send exactly 3 messages
   - Send 4th message while 3 active
   - Verify: 4th queues, processes immediately when one completes

4. **Empty conversation ID handling**
   - Send message with empty string conversationId
   - Verify: Handles gracefully (queues/processes like any other ID)

5. **Very long conversation ID (platform edge case)**
   - Use 500-character conversationId (e.g., GitHub issue with long repo path)
   - Verify: No issues with Map key storage or logging

6. **Zero messages after startup**
   - Start app, immediately check /health/concurrency
   - Verify: Returns empty state correctly

7. **Concurrent stats queries**
   - While processing 10 conversations, call /health/concurrency 100 times rapidly
   - Verify: No race conditions, all requests return valid data

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking
npm run type-check

# ESLint syntax and style (if configured)
npm run lint

# Prettier formatting check (if configured)
npm run format:check
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

```bash
# Run all tests
npm test

# Run only lock manager tests
npm test -- conversation-lock.test.ts

# Run with coverage
npm test -- --coverage
```

**Expected**: All tests pass, new tests added for ConversationLockManager

### Level 3: Build Validation

```bash
# Clean build
rm -rf dist/
npm run build

# Verify output
ls -la dist/utils/conversation-lock.js
ls -la dist/index.js
```

**Expected**: Build succeeds, new files present in dist/

### Level 4: Runtime Validation

```bash
# Build and start application with Docker Compose
docker-compose up -d --build

# Wait for startup (check logs)
docker-compose logs -f app
# Look for: [ConversationLock] Initialized { maxConcurrent: 10 }
# Press Ctrl+C after seeing initialization complete

# In another terminal or after stopping log tail:
# Test health endpoint
curl http://localhost:3000/health/concurrency

# Test concurrent messages (5 different conversations)
for i in {1..5}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"test-$i\",\"message\":\"Hello $i\"}" &
done

# Check concurrency stats (should show multiple active)
sleep 2
curl http://localhost:3000/health/concurrency | jq

# View logs to see concurrent processing
docker-compose logs app | grep ConversationLock | tail -20

# Test per-conversation queueing (3 messages to same conversation)
for i in {1..3}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"same\",\"message\":\"Msg $i\"}" &
done

# Check stats (should show 1 active "same", 2 queued)
sleep 1
curl http://localhost:3000/health/concurrency | jq

# View queuing logs
docker-compose logs app | grep "same" | tail -10
```

**Expected**:
- Health endpoint returns correct structure
- Multiple conversations process simultaneously
- Same conversation queues messages
- Logs show "[ConversationLock]" entries with correct behavior

### Level 5: Capacity Limit Validation

```bash
# Set low limit for testing
echo "MAX_CONCURRENT_CONVERSATIONS=2" >> .env

# Rebuild and restart app with Docker Compose
docker-compose down
docker-compose up -d --build

# Check logs show new limit
docker-compose logs app | grep "max concurrent"

# Send 5 messages (should queue 3)
for i in {1..5}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"conv-$i\",\"message\":\"Test\"}" &
done

# Check stats (should show max 2 active, 3 queued)
sleep 1
curl http://localhost:3000/health/concurrency | jq

# Wait for completion
sleep 60
curl http://localhost:3000/health/concurrency | jq
# Should show all processed (active: 0, queuedTotal: 0)
```

**Expected**: Concurrency never exceeds MAX_CONCURRENT_CONVERSATIONS

---

## ACCEPTANCE CRITERIA

- [x] ConversationLockManager class created in src/utils/conversation-lock.ts
- [x] Unit tests pass for lock manager (src/utils/conversation-lock.test.ts)
- [x] Event handlers refactored to non-blocking (Telegram + Test adapter)
- [x] /health/concurrency endpoint returns accurate stats
- [x] MAX_CONCURRENT_CONVERSATIONS environment variable supported
- [x] Multiple conversations (up to 10) process concurrently
- [x] Same conversation messages process sequentially (no race conditions)
- [x] Messages queue when at capacity (global or per-conversation)
- [x] All existing logging preserved (orchestrator, command handler, clients)
- [x] Error handling unchanged (errors logged, don't block other conversations)
- [x] All existing tests pass (no regressions)
- [x] TypeScript compilation succeeds with no errors
- [x] Application starts and runs without crashes
- [x] Manual validation via test adapter confirms concurrent behavior
- [x] Stats endpoint shows accurate active/queued counts

---

## COMPLETION CHECKLIST

- [ ] All 22 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: type-check, lint, format:check
  - [ ] Level 2: npm test (all tests pass)
  - [ ] Level 3: npm run build (clean build)
  - [ ] Level 4: Manual runtime tests (concurrent behavior confirmed)
  - [ ] Level 5: Capacity limit validation (queuing works)
- [ ] Full test suite passes (unit + integration)
- [ ] No compilation errors (npm run type-check)
- [ ] No linting errors (npm run lint)
- [ ] Application runs without crashes
- [ ] Logs show proper "[ConversationLock]" entries
- [ ] /health/concurrency endpoint returns valid JSON
- [ ] Concurrent conversations verified via test adapter
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability

---

## Notes

### Security Considerations

**No security concerns introduced** - lock manager operates on already-validated data:
- `conversationId`: Already validated by platform adapters
- `handler`: Defined by application code, not user input
- No new user-facing inputs or endpoints (except stats endpoint - read-only)

**Stats endpoint (/health/concurrency):**
- Exposes conversation IDs (already non-sensitive: chat IDs, thread IDs)
- No authentication (consistent with existing /health endpoints)
- Read-only (no state modification possible)
- Could add authentication in future if needed (not in scope for MVP)

### References

- **Node.js Async Patterns**: [https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking](https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking)
- **Map Performance**: [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#performance](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#performance)
- **Promise Patterns**: [https://www.typescriptlang.org/docs/handbook/release-notes/typescript-1-7.html#asyncawait](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-1-7.html#asyncawait)
- **Telegraf Handler Timeout**: [https://telegraf.js.org/classes/Telegraf.html#constructor](https://telegraf.js.org/classes/Telegraf.html#constructor)
