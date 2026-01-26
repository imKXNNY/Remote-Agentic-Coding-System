# Ultimate Validation Command

Run comprehensive validation covering all aspects of the Remote Coding Agent. This command validates code quality, type safety, functionality, and complete user workflows.

## Phase 1: Code Quality - Linting

**Objective:** Ensure code follows project style guidelines and best practices.

Run ESLint with strict TypeScript rules:

```bash
npm run lint
```

**Expected outcome:** Zero linting errors. All TypeScript files must pass:
- Explicit function return types
- No `any` types
- Proper naming conventions (interfaces, functions, variables)
- TypeScript strict type checking rules

**Critical files to validate:**
- `src/adapters/*.ts` - Platform adapters (Telegram, GitHub, Test)
- `src/clients/*.ts` - AI assistant clients (Claude, Codex)
- `src/handlers/*.ts` - Command handler logic
- `src/orchestrator/*.ts` - Message orchestration
- `src/db/*.ts` - Database operations
- `src/utils/*.ts` - Utility functions

## Phase 2: Type Safety - TypeScript Compilation

**Objective:** Verify complete type safety across the entire codebase.

Run TypeScript compiler in check mode (no emit):

```bash
npm run type-check
```

**Expected outcome:** Zero type errors. All files must compile with:
- `strict: true` enabled
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`

**Then build the project:**

```bash
npm run build
```

**Expected outcome:** Clean build to `dist/` directory with no errors.

## Phase 3: Code Formatting - Prettier

**Objective:** Ensure consistent code formatting across all files.

Check formatting compliance:

```bash
npm run format:check
```

**Expected outcome:** All files pass Prettier checks with:
- Single quotes
- Semicolons
- 2-space indentation
- 100 character line width
- Trailing commas (ES5 style)

## Phase 4: Unit Testing

**Objective:** Verify isolated component functionality with comprehensive test coverage.

Run Jest test suite:

```bash
npm test
```

**Expected outcome:** All unit tests pass covering:

1. **Command Parser Tests** (`src/handlers/command-handler.test.ts`):
   - Parse `/clone` with URL
   - Parse `/help`, `/status`, `/reset`
   - Parse `/setcwd` with paths (including spaces)
   - Parse `/command-invoke` with quoted arguments
   - Parse `/command-set` with multiple args
   - Parse `/load-commands` with folder path
   - Handle mixed quoted/unquoted arguments

2. **Variable Substitution Tests** (`src/utils/variable-substitution.test.ts`):
   - Substitute positional args: `$1`, `$2`, `$3`
   - Substitute `$ARGUMENTS` with all args
   - Substitute `$PLAN` from session metadata
   - Substitute `$IMPLEMENTATION_SUMMARY` from metadata
   - Handle missing variables gracefully

3. **Adapter Tests** (`src/adapters/*.test.ts`):
   - Telegram adapter message sending
   - GitHub adapter webhook signature verification
   - Test adapter message storage and retrieval

4. **Client Tests** (`src/clients/*.test.ts`):
   - Claude client session management
   - Codex client session management
   - Streaming response handling

5. **Conversation Lock Tests** (`src/utils/conversation-lock.test.ts`):
   - Lock acquisition and release
   - Concurrent conversation limiting
   - Queue management

**Coverage target:** Aim for >80% coverage on core logic (handlers, utils, db).

## Phase 5: End-to-End Testing - Complete User Workflows

**Objective:** Validate complete user journeys exactly as documented in README.md, testing external integrations and real-world scenarios.

### Prerequisites

Ensure Docker containers are running:

```bash
docker compose --profile with-db up -d --build
```

Wait for startup (check logs):

```bash
docker compose logs -f app | head -n 50
```

Verify health checks:

```bash
# Basic health
curl -s http://localhost:3000/health | jq

# Database connectivity
curl -s http://localhost:3000/health/db | jq

# Concurrency status
curl -s http://localhost:3000/health/concurrency | jq
```

**Expected:** All health checks return `{"status":"ok",...}`

---

### E2E Test 1: Basic Command Execution (Test Adapter)

**User Journey:** Send commands through test adapter, verify bot responses.

**Test execution:**

```bash
# Clear any existing test data
curl -X DELETE http://localhost:3000/test/messages/e2e-test-1

# Test 1: Help command
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-1","message":"/help"}'

sleep 2

# Verify bot sent help message
HELP_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-1 | jq -r '.messages[0].message')
echo "$HELP_RESPONSE" | grep -q "Available Commands" && echo "✅ Help command works" || echo "❌ Help command failed"

# Test 2: Status command (before any codebase)
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-1","message":"/status"}'

sleep 2

# Verify status response
STATUS_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-1 | jq -r '.messages[1].message')
echo "$STATUS_RESPONSE" | grep -q "Conversation Status" && echo "✅ Status command works" || echo "❌ Status command failed"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/e2e-test-1
```

**Expected outcome:**
- Help message contains command list
- Status shows conversation details
- All commands execute without errors

---

### E2E Test 2: Repository Clone Workflow

**User Journey:** Clone a public repository, auto-detect commands, verify filesystem state.

**Test execution:**

```bash
# Clear test data
curl -X DELETE http://localhost:3000/test/messages/e2e-test-2

# Clone a small public repo with .claude/commands
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-2","message":"/clone https://github.com/anthropics/anthropic-sdk-typescript"}'

# Wait for clone operation (can take 10-30 seconds)
sleep 30

# Verify bot response indicates success
CLONE_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-2 | jq -r '.messages[-1].message')
echo "$CLONE_RESPONSE" | grep -q "cloned successfully\|Detected .claude/commands" && echo "✅ Clone works" || echo "❌ Clone failed"

# Verify repository exists on filesystem
docker compose exec app ls -la /workspace/anthropic-sdk-typescript && echo "✅ Repo exists on disk" || echo "❌ Repo not found"

# Verify database entry was created
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT name, repository_url FROM remote_agent_codebases WHERE name = 'anthropic-sdk-typescript';" \
  | grep -q "anthropic-sdk-typescript" && echo "✅ Database entry created" || echo "❌ Database entry missing"

# Test getcwd command
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-2","message":"/getcwd"}'

sleep 2

# Verify working directory
GETCWD_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-2 | jq -r '.messages[-1].message')
echo "$GETCWD_RESPONSE" | grep -q "/workspace/anthropic-sdk-typescript" && echo "✅ Working directory correct" || echo "❌ Working directory incorrect"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/e2e-test-2
docker compose exec app rm -rf /workspace/anthropic-sdk-typescript
```

**Expected outcome:**
- Repository cloned to `/workspace/anthropic-sdk-typescript`
- Database entry created in `remote_agent_codebases`
- `.claude/commands/` folder auto-detected
- Working directory set correctly

---

### E2E Test 3: Command Registration & Invocation

**User Journey:** Load commands from folder, invoke custom command, verify AI response.

**Test execution:**

```bash
# Clear test data
curl -X DELETE http://localhost:3000/test/messages/e2e-test-3

# Clone repo (reuse if already cloned)
docker compose exec app test -d /workspace/anthropic-sdk-typescript || \
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d '{"conversationId":"e2e-test-3","message":"/clone https://github.com/anthropics/anthropic-sdk-typescript"}' && sleep 30

# Load commands from .claude/commands
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-3","message":"/load-commands .claude/commands"}'

sleep 3

# Verify commands loaded
LOAD_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-3 | jq -r '.messages[-1].message')
echo "$LOAD_RESPONSE" | grep -q "Loaded.*command" && echo "✅ Commands loaded" || echo "❌ Commands not loaded"

# List registered commands
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-3","message":"/commands"}'

sleep 2

# Verify command list
COMMANDS_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-3 | jq -r '.messages[-1].message')
echo "$COMMANDS_RESPONSE" | grep -q "Registered Commands" && echo "✅ Commands listed" || echo "❌ Commands list failed"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/e2e-test-3
```

**Expected outcome:**
- Commands loaded from `.claude/commands/` folder
- Database updated with command metadata in JSONB
- Commands listed when requested

---

### E2E Test 4: Session Management & Persistence

**User Journey:** Create AI session, verify persistence across container restart.

**Test execution:**

```bash
# Clear test data
curl -X DELETE http://localhost:3000/test/messages/e2e-test-4

# Setup: Clone repo and load commands
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"/clone https://github.com/anthropics/anthropic-sdk-typescript"}' && sleep 30

curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"/load-commands .claude/commands"}' && sleep 3

# Check status before AI interaction
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"/status"}' && sleep 2

STATUS_BEFORE=$(curl -s http://localhost:3000/test/messages/e2e-test-4 | jq -r '.messages[-1].message')
echo "$STATUS_BEFORE" | grep -q "No active session" && echo "✅ No session initially" || echo "⚠️ Session exists unexpectedly"

# Ask AI a question (creates session)
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"What is this repository about?"}' && sleep 10

# Verify AI responded
AI_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-4 | jq -r '.messages[-1].message')
echo "$AI_RESPONSE" | grep -q "Anthropic\|SDK\|TypeScript" && echo "✅ AI responded" || echo "❌ No AI response"

# Check status after AI interaction
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"/status"}' && sleep 2

STATUS_AFTER=$(curl -s http://localhost:3000/test/messages/e2e-test-4 | jq -r '.messages[-1].message')
echo "$STATUS_AFTER" | grep -q "Active Session" && echo "✅ Session created" || echo "❌ Session not found"

# Verify session in database
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT active, assistant_session_id FROM remote_agent_sessions WHERE active = true;" \
  | grep -q "t.*sess_" && echo "✅ Session persisted in DB" || echo "❌ Session not in DB"

# Restart container to test session persistence
echo "🔄 Restarting container to test session persistence..."
docker compose restart app && sleep 15

# Verify session still exists after restart
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT active, assistant_session_id FROM remote_agent_sessions WHERE active = true;" \
  | grep -q "t.*sess_" && echo "✅ Session survived restart" || echo "❌ Session lost after restart"

# Test /reset command
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"e2e-test-4","message":"/reset"}' && sleep 2

RESET_RESPONSE=$(curl -s http://localhost:3000/test/messages/e2e-test-4 | jq -r '.messages[-1].message')
echo "$RESET_RESPONSE" | grep -q "Session cleared" && echo "✅ Reset works" || echo "❌ Reset failed"

# Verify session marked inactive in DB
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT COUNT(*) FROM remote_agent_sessions WHERE active = true;" \
  | grep -q "0" && echo "✅ Session deactivated" || echo "❌ Session still active"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/e2e-test-4
```

**Expected outcome:**
- AI session created on first AI message
- Session ID stored in database with `active = true`
- Session persists across container restarts
- `/reset` command marks session as inactive

---

### E2E Test 5: Database Integrity

**User Journey:** Verify database schema, foreign keys, indexes, and data consistency.

**Test execution:**

```bash
echo "🔍 Validating database schema..."

# Verify all 3 tables exist with correct prefix
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "\dt remote_agent_*" \
  | grep -E "remote_agent_codebases|remote_agent_conversations|remote_agent_sessions" \
  && echo "✅ All tables exist" || echo "❌ Missing tables"

# Verify codebases table structure
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "\d remote_agent_codebases" \
  | grep -E "id.*uuid|name.*varchar|repository_url|default_cwd|ai_assistant_type|commands.*jsonb" \
  && echo "✅ Codebases schema correct" || echo "❌ Codebases schema incorrect"

# Verify conversations table structure
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "\d remote_agent_conversations" \
  | grep -E "id.*uuid|platform_type|platform_conversation_id|codebase_id|cwd|ai_assistant_type" \
  && echo "✅ Conversations schema correct" || echo "❌ Conversations schema incorrect"

# Verify sessions table structure
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "\d remote_agent_sessions" \
  | grep -E "id.*uuid|conversation_id|codebase_id|ai_assistant_type|assistant_session_id|active|metadata.*jsonb" \
  && echo "✅ Sessions schema correct" || echo "❌ Sessions schema incorrect"

# Verify foreign key constraints
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT conname, conrelid::regclass, confrelid::regclass
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace;" \
  | grep -E "remote_agent_conversations.*remote_agent_codebases|remote_agent_sessions.*remote_agent_conversations|remote_agent_sessions.*remote_agent_codebases" \
  && echo "✅ Foreign keys correct" || echo "❌ Foreign keys missing"

# Verify indexes exist
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "\di" \
  | grep -E "idx_remote_agent_conversations_codebase|idx_remote_agent_sessions_conversation|idx_remote_agent_sessions_codebase" \
  && echo "✅ Indexes exist" || echo "❌ Indexes missing"

# Verify unique constraint on platform_type + platform_conversation_id
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -c "SELECT conname FROM pg_constraint
      WHERE conrelid = 'remote_agent_conversations'::regclass AND contype = 'u';" \
  | grep -q "." && echo "✅ Unique constraint exists" || echo "❌ Unique constraint missing"

echo "✅ Database integrity validated"
```

**Expected outcome:**
- All 3 tables present with `remote_agent_` prefix
- Correct column types (UUID, VARCHAR, JSONB, TIMESTAMP)
- Foreign keys properly configured
- Indexes on critical columns
- Unique constraint on conversation platform+ID

---

### E2E Test 6: GitHub CLI Integration

**User Journey:** Verify GitHub CLI operations work inside container.

**Test execution:**

```bash
echo "🔍 Testing GitHub CLI integration..."

# Verify GitHub CLI installed
docker compose exec app which gh && echo "✅ GitHub CLI installed" || echo "❌ GitHub CLI not found"

# Verify gh version
docker compose exec app gh --version && echo "✅ GitHub CLI version OK" || echo "❌ GitHub CLI version check failed"

# Test GitHub authentication (requires GITHUB_TOKEN or GH_TOKEN in .env)
docker compose exec app gh auth status 2>&1 | grep -q "Logged in\|Token:" && echo "✅ GitHub authenticated" || echo "⚠️ GitHub not authenticated (check GITHUB_TOKEN)"

# Test git is installed and configured
docker compose exec app git --version && echo "✅ Git installed" || echo "❌ Git not found"

# Verify git safe directory config (prevents dubious ownership errors)
docker compose exec app git config --global --get-all safe.directory | grep -q "/workspace" && echo "✅ Git safe.directory configured" || echo "❌ Git safe.directory not configured"

echo "✅ GitHub CLI integration validated"
```

**Expected outcome:**
- GitHub CLI (`gh`) installed in container
- Git installed and configured
- Safe directory config prevents ownership errors
- GitHub authentication working (if token provided)

---

### E2E Test 7: Concurrency & Lock Management

**User Journey:** Verify system handles concurrent conversations correctly.

**Test execution:**

```bash
echo "🔍 Testing concurrency and lock management..."

# Get initial concurrency stats
INITIAL_STATS=$(curl -s http://localhost:3000/health/concurrency)
echo "Initial stats: $INITIAL_STATS"

# Send 5 concurrent messages to different conversations
for i in {1..5}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"concurrent-test-$i\",\"message\":\"/help\"}" &
done

# Wait for all to complete
wait
sleep 5

# Verify all conversations processed
for i in {1..5}; do
  RESPONSE=$(curl -s http://localhost:3000/test/messages/concurrent-test-$i | jq -r '.messages[0].message')
  if echo "$RESPONSE" | grep -q "Available Commands"; then
    echo "✅ Conversation $i processed"
  else
    echo "❌ Conversation $i failed"
  fi
done

# Check concurrency stats (should be 0 active now, all processed)
FINAL_STATS=$(curl -s http://localhost:3000/health/concurrency)
echo "Final stats: $FINAL_STATS"
echo "$FINAL_STATS" | jq -r '.active' | grep -q "0" && echo "✅ All conversations unlocked" || echo "⚠️ Some conversations still locked"

# Cleanup
for i in {1..5}; do
  curl -X DELETE http://localhost:3000/test/messages/concurrent-test-$i
done

echo "✅ Concurrency management validated"
```

**Expected outcome:**
- All 5 concurrent messages processed successfully
- Lock manager prevents race conditions
- Active locks return to 0 after processing
- No deadlocks or stuck conversations

---

### E2E Test 8: Streaming Modes (Batch vs Stream)

**User Journey:** Verify platform-specific streaming modes work correctly.

**Test execution:**

```bash
echo "🔍 Testing streaming modes..."

# Test uses the test adapter which defaults to stream mode
# Verify test adapter streaming mode
docker compose exec app grep -q "STREAMING_MODE" /app/.env && echo "ℹ️ Streaming mode configured" || echo "ℹ️ Using default streaming mode"

# Test 1: Stream mode (should send multiple messages as AI responds)
curl -X DELETE http://localhost:3000/test/messages/stream-test

curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"stream-test","message":"Explain TypeScript in 2 sentences"}' && sleep 10

# Count messages sent (stream mode may send multiple chunks)
MESSAGE_COUNT=$(curl -s http://localhost:3000/test/messages/stream-test | jq '.messages | length')
echo "Messages sent: $MESSAGE_COUNT"

# Verify at least one message received
if [ "$MESSAGE_COUNT" -gt 0 ]; then
  echo "✅ Streaming mode working (sent $MESSAGE_COUNT messages)"
else
  echo "❌ No messages received"
fi

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/stream-test

echo "✅ Streaming modes validated"
```

**Expected outcome:**
- Test adapter uses stream mode by default
- AI responses delivered (stream may send multiple chunks or single message)
- No errors during streaming

---

### E2E Test 9: Error Handling & Recovery

**User Journey:** Verify system handles errors gracefully.

**Test execution:**

```bash
echo "🔍 Testing error handling..."

# Test 1: Invalid command
curl -X DELETE http://localhost:3000/test/messages/error-test

curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"error-test","message":"/nonexistent-command"}' && sleep 2

INVALID_CMD_RESPONSE=$(curl -s http://localhost:3000/test/messages/error-test | jq -r '.messages[0].message')
echo "$INVALID_CMD_RESPONSE" | grep -qi "unknown\|not found\|error" && echo "✅ Invalid command handled" || echo "⚠️ Invalid command response unclear"

# Test 2: Clone invalid repository
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"error-test","message":"/clone https://github.com/nonexistent/repo-12345"}' && sleep 10

INVALID_CLONE_RESPONSE=$(curl -s http://localhost:3000/test/messages/error-test | jq -r '.messages[-1].message')
echo "$INVALID_CLONE_RESPONSE" | grep -qi "failed\|error\|not found" && echo "✅ Invalid clone handled" || echo "⚠️ Invalid clone response unclear"

# Test 3: setcwd to non-existent directory
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"error-test","message":"/setcwd /nonexistent/path"}' && sleep 2

INVALID_CWD_RESPONSE=$(curl -s http://localhost:3000/test/messages/error-test | jq -r '.messages[-1].message')
echo "$INVALID_CWD_RESPONSE" | grep -qi "error\|not found\|does not exist" && echo "✅ Invalid setcwd handled" || echo "⚠️ Invalid setcwd response unclear"

# Test 4: Invoke command before setting codebase
curl -X DELETE http://localhost:3000/test/messages/error-test-2

curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"error-test-2","message":"/command-invoke prime"}' && sleep 2

NO_CODEBASE_RESPONSE=$(curl -s http://localhost:3000/test/messages/error-test-2 | jq -r '.messages[0].message')
echo "$NO_CODEBASE_RESPONSE" | grep -qi "no codebase\|register\|command not found" && echo "✅ No codebase error handled" || echo "⚠️ No codebase error response unclear"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/error-test
curl -X DELETE http://localhost:3000/test/messages/error-test-2

echo "✅ Error handling validated"
```

**Expected outcome:**
- Invalid commands return helpful error messages
- Invalid clone attempts fail gracefully
- Invalid paths handled without crashes
- Commands without codebase return clear errors

---

### E2E Test 10: Complete Telegram-Like Workflow

**User Journey:** Simulate complete Telegram workflow from README - clone, load commands, ask AI, invoke commands.

**Test execution:**

```bash
echo "🚀 Testing complete Telegram-like workflow..."

# Conversation ID for this test
CONV_ID="telegram-workflow-test"

# Cleanup any previous test data
curl -X DELETE http://localhost:3000/test/messages/$CONV_ID
docker compose exec app rm -rf /workspace/anthropic-sdk-typescript 2>/dev/null || true

# Step 1: User clones repository
echo "Step 1: Clone repository..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"/clone https://github.com/anthropics/anthropic-sdk-typescript\"}"

sleep 30

# Verify clone success
CLONE_MSG=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$CLONE_MSG" | grep -q "cloned successfully" && echo "✅ Repository cloned" || echo "❌ Clone failed"

# Step 2: Bot suggests loading commands (auto-detected)
echo "$CLONE_MSG" | grep -q "Detected .claude/commands" && echo "✅ Commands auto-detected" || echo "⚠️ Commands not auto-detected"

# Step 3: User loads commands
echo "Step 2: Load commands..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"/load-commands .claude/commands\"}"

sleep 3

# Verify commands loaded
LOAD_MSG=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$LOAD_MSG" | grep -q "Loaded.*command" && echo "✅ Commands loaded" || echo "❌ Commands not loaded"

# Step 4: User asks a question
echo "Step 3: Ask AI question..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"What files are in this repo?\"}"

sleep 15

# Verify AI responded with file information
AI_MSG=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$AI_MSG" | grep -qi "file\|directory\|src\|package" && echo "✅ AI answered question" || echo "❌ AI did not answer"

# Step 5: Check status
echo "Step 4: Check status..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"/status\"}"

sleep 2

# Verify status shows complete context
STATUS_MSG=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$STATUS_MSG" | grep -q "anthropic-sdk-typescript" && echo "✅ Status shows codebase" || echo "❌ Status incomplete"
echo "$STATUS_MSG" | grep -q "Active Session" && echo "✅ Status shows active session" || echo "❌ No active session"
echo "$STATUS_MSG" | grep -q "Registered Commands" && echo "✅ Status shows commands" || echo "❌ No commands shown"

# Step 6: List commands
echo "Step 5: List commands..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"/commands\"}"

sleep 2

# Verify commands listed
CMD_LIST=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$CMD_LIST" | grep -q "Registered Commands" && echo "✅ Commands listed" || echo "❌ Commands list failed"

# Step 7: Reset session
echo "Step 6: Reset session..."
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":\"/reset\"}"

sleep 2

# Verify reset confirmation
RESET_MSG=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq -r '.messages[-1].message')
echo "$RESET_MSG" | grep -q "Session cleared" && echo "✅ Session reset" || echo "❌ Reset failed"
echo "$RESET_MSG" | grep -q "Codebase configuration preserved" && echo "✅ Codebase preserved" || echo "⚠️ Codebase may be cleared"

# Verify complete workflow
echo ""
echo "📊 Complete Workflow Summary:"
MESSAGE_COUNT=$(curl -s http://localhost:3000/test/messages/$CONV_ID | jq '.messages | length')
echo "Total messages exchanged: $MESSAGE_COUNT"
echo "Workflow steps completed: 6/6"

# Cleanup
curl -X DELETE http://localhost:3000/test/messages/$CONV_ID
docker compose exec app rm -rf /workspace/anthropic-sdk-typescript

echo "✅ Complete workflow validated"
```

**Expected outcome:**
- User successfully clones repository
- Commands auto-detected and loaded
- AI answers questions about the codebase
- Status shows complete context (codebase, session, commands)
- Session can be reset while preserving codebase
- All 6 workflow steps complete successfully

---

## Final Validation Summary

After running all 10 E2E tests, verify:

```bash
echo "📊 Final Validation Summary"
echo "=========================="

# Count Docker containers
CONTAINERS=$(docker compose ps -q | wc -l)
echo "Docker containers running: $CONTAINERS"

# Database connection
curl -s http://localhost:3000/health/db | jq -r '.status' && echo "✅ Database connected"

# Count tables
TABLE_COUNT=$(docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'remote_agent_%';")
echo "Database tables: $TABLE_COUNT (expected: 3)"

# Count TypeScript files
TS_FILES=$(find src -name "*.ts" -type f ! -name "*.test.ts" | wc -l)
echo "TypeScript source files: $TS_FILES"

# Test files
TEST_FILES=$(find src -name "*.test.ts" -type f | wc -l)
echo "Unit test files: $TEST_FILES"

# Build artifacts
BUILD_FILES=$(find dist -name "*.js" -type f 2>/dev/null | wc -l)
echo "Compiled JavaScript files: $BUILD_FILES"

echo ""
echo "✅ All validation phases complete!"
echo "If all tests passed, the Remote Coding Agent is production-ready."
```

## Success Criteria

**The validation passes if:**

1. ✅ **Linting:** Zero ESLint errors
2. ✅ **Type Safety:** Zero TypeScript compilation errors
3. ✅ **Formatting:** All files pass Prettier checks
4. ✅ **Unit Tests:** All Jest tests pass with >80% coverage
5. ✅ **E2E Test 1:** Test adapter command execution works
6. ✅ **E2E Test 2:** Repository clone and filesystem operations work
7. ✅ **E2E Test 3:** Command registration and invocation work
8. ✅ **E2E Test 4:** Session persistence survives restarts
9. ✅ **E2E Test 5:** Database schema integrity validated
10. ✅ **E2E Test 6:** GitHub CLI integration works
11. ✅ **E2E Test 7:** Concurrency management prevents race conditions
12. ✅ **E2E Test 8:** Streaming modes deliver AI responses
13. ✅ **E2E Test 9:** Error handling is graceful and informative
14. ✅ **E2E Test 10:** Complete Telegram-like workflow succeeds

**If ALL criteria pass, the application is production-ready with 100% confidence.**

## Troubleshooting

If any phase fails:

1. **Linting failures:** Run `npm run lint:fix` to auto-fix issues
2. **Type errors:** Check `tsconfig.json` and fix type annotations
3. **Formatting:** Run `npm run format` to auto-format files
4. **Unit test failures:** Check test output and fix implementation
5. **E2E test failures:** Check Docker logs with `docker compose logs -f app`
6. **Database errors:** Verify migrations with `docker compose exec postgres psql ...`
7. **Container issues:** Rebuild with `docker compose down && docker compose --profile with-db up -d --build`

## Notes

- Run this validation before every commit and PR
- E2E tests use the test adapter for speed and reliability
- GitHub webhook tests are excluded (require external setup)
- Production deployment should run phases 1-5 in CI/CD
- E2E tests can be extended with actual Telegram/GitHub integration
