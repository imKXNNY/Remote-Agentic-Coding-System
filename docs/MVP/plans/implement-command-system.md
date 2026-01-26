# Feature: Generic Command System

Implement command registration, loading, and invocation with variable substitution and session context passing.

## Feature Description

Enable users to define custom AI commands as markdown files, register them in the database, and execute them with argument substitution (`$1`, `$ARGUMENTS`). Supports multi-phase workflows like prime→plan→execute→commit with file-based context passing.

**User Story:**
As a developer, I want to define reusable AI commands with arguments and context passing, so that I can create sophisticated multi-phase development workflows.

**Primary Systems**: Command Handler, Orchestrator, Database (codebases, sessions)

---

## CONTEXT REFERENCES

### Must Read Before Implementation

**Core Patterns:**
- `src/handlers/command-handler.ts` (lines 1-199) - Slash command structure, error handling
- `src/orchestrator/orchestrator.ts` (lines 12-109) - Message routing, session management
- `src/db/codebases.ts` (lines 1-26) - Database CRUD pattern
- `src/db/sessions.ts` (lines 1-40) - Session operations, metadata handling
- `.agents/PRD.md` (lines 119-249) - Complete command system specification

**Example Commands:**
- `.claude/commands/commit.md` - Simple command structure
- `.claude/commands/core_piv_loop/plan-feature.md` - Variable usage example (`$ARGUMENTS`)

**Interfaces:**
- `src/types/index.ts` (line 39) - `CommandResult` interface
- `src/types/index.ts` (line 16) - `Codebase` interface with `commands` JSONB

### New Files to Create

- `src/utils/variable-substitution.ts` - Variable replacement engine
- `src/utils/variable-substitution.test.ts` - Unit tests

### Key Patterns to Follow

**Error Handling** (command-handler.ts:167-174):
```typescript
try {
  // operation
  return { success: true, message: 'Success', modified: true };
} catch (error) {
  const err = error as Error;
  console.error('[Component] Failed:', err);
  return { success: false, message: `Failed: ${err.message}` };
}
```

**Database Update** (conversations.ts:28-56):
```typescript
const fields: string[] = [];
const values: any[] = [];
let i = 1;
if (updates.field !== undefined) {
  fields.push(`field = $${i++}`);
  values.push(updates.field);
}
fields.push('updated_at = NOW()');
values.push(id);
await pool.query(`UPDATE table SET ${fields.join(', ')} WHERE id = $${i}`, values);
```

---

## IMPLEMENTATION PLAN

### Phase 1: Variable Substitution Foundation
Create utility for replacing `$1`, `$2`, `$ARGUMENTS` in command text.

### Phase 2: Database Extensions
Add command CRUD operations and session metadata updates.

### Phase 3: Command Handlers
Implement `/command-set`, `/load-commands`, `/commands` slash commands.

### Phase 4: Orchestrator Integration (CRITICAL - Complex)
Route `/command-invoke`, handle variable substitution, manage session transitions (plan→execute).

### Phase 5: Auto-detection
Detect command folders on `/clone` and suggest loading.

---

## STEP-BY-STEP TASKS

### CREATE src/utils/variable-substitution.ts

**Function:**
```typescript
export function substituteVariables(
  text: string,
  args: string[],
  metadata: Record<string, any> = {}
): string {
  let result = text;

  // Positional args $1-$9
  args.forEach((arg, index) => {
    result = result.replace(new RegExp(`\\$${index + 1}`, 'g'), arg);
  });

  // $ARGUMENTS - all arguments as single string
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // Escaped dollar signs
  result = result.replace(/\\\$/g, '$');

  return result;
}
```

**Note:** No `$PLAN` or `$IMPLEMENTATION_SUMMARY` variables. Commands use file-based communication via conventions (e.g., execute reads latest plan from `.agents/plans/` directory).

**VALIDATE:** `npm run type-check`

---

### CREATE src/utils/variable-substitution.test.ts

**Test cases:**
```typescript
import { substituteVariables } from './variable-substitution';

describe('substituteVariables', () => {
  test('replaces positional arguments', () => {
    expect(substituteVariables('Task: $1, Priority: $2', ['Fix bug', 'High']))
      .toBe('Task: Fix bug, Priority: High');
  });

  test('replaces $ARGUMENTS', () => {
    expect(substituteVariables('Plan: $ARGUMENTS', ['Add', 'dark', 'mode']))
      .toBe('Plan: Add dark mode');
  });

  test('handles missing args gracefully', () => {
    expect(substituteVariables('$1, $2, $3', ['first']))
      .toBe('first, , ');
  });

  test('handles escaped dollar signs', () => {
    expect(substituteVariables('Price: \\$50, Arg: $1', ['value']))
      .toBe('Price: $50, Arg: value');
  });

  test('returns unchanged text with no variables', () => {
    expect(substituteVariables('No variables here', []))
      .toBe('No variables here');
  });
});
```

**VALIDATE:** `npm test -- src/utils/variable-substitution.test.ts`

---

### ADD src/db/codebases.ts - Command operations

Add after `getCodebase`:
```typescript
export async function updateCodebaseCommands(
  id: string,
  commands: Record<string, { path: string; description: string }>
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET commands = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(commands), id]
  );
}

export async function getCodebaseCommands(id: string): Promise<Record<string, { path: string; description: string }>> {
  const result = await pool.query<{ commands: Record<string, any> }>(
    'SELECT commands FROM remote_agent_codebases WHERE id = $1',
    [id]
  );
  return result.rows[0]?.commands || {};
}

export async function registerCommand(
  id: string,
  name: string,
  command: { path: string; description: string }
): Promise<void> {
  const commands = await getCodebaseCommands(id);
  commands[name] = command;
  await updateCodebaseCommands(id, commands);
}
```

**VALIDATE:** `npm run type-check`

---

### ADD src/db/sessions.ts - Metadata operations

Add after `deactivateSession`:
```typescript
export async function updateSessionMetadata(
  id: string,
  metadata: Record<string, any>
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_sessions SET metadata = metadata || $1::jsonb WHERE id = $2',
    [JSON.stringify(metadata), id]
  );
}
```

**VALIDATE:** `npm run type-check`

---

### UPDATE src/handlers/command-handler.ts - Fix quote parsing

**CRITICAL:** Current `parseCommand` splits on whitespace, breaking quoted args.

**Replace parseCommand function:**
```typescript
export function parseCommand(text: string): { command: string; args: string[] } {
  // Match quoted strings or non-whitespace sequences
  const matches = text.match(/"[^"]+"|'[^']+'|\S+/g) || [];

  if (matches.length === 0) {
    return { command: '', args: [] };
  }

  const command = matches[0].substring(1); // Remove leading '/'
  const args = matches.slice(1).map(arg => {
    // Remove surrounding quotes if present
    if ((arg.startsWith('"') && arg.endsWith('"')) ||
        (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1);
    }
    return arg;
  });

  return { command, args };
}
```

**Add test cases:**
```typescript
test('parses quoted arguments', () => {
  const result = parseCommand('/command-invoke plan "Add dark mode"');
  expect(result.command).toBe('command-invoke');
  expect(result.args).toEqual(['plan', 'Add dark mode']);
});

test('parses mixed quoted and unquoted args', () => {
  const result = parseCommand('/command-set test .test.md "Task: $1"');
  expect(result.command).toBe('command-set');
  expect(result.args).toEqual(['test', '.test.md', 'Task: $1']);
});
```

**VALIDATE:** `npm test -- src/handlers/command-handler.test.ts`

---

### UPDATE src/handlers/command-handler.ts - Add commands

**Add imports:**
```typescript
import { readFile, writeFile, readdir, access } from 'fs/promises';
import { join, basename } from 'path';
import * as codebaseDb from '../db/codebases';
```

**Add to switch statement:**

**Case: command-set**
```typescript
case 'command-set': {
  if (args.length < 2) return { success: false, message: 'Usage: /command-set <name> <path> [text]' };
  if (!conversation.codebase_id) return { success: false, message: 'No codebase configured. Use /clone first.' };

  const [commandName, commandPath, ...textParts] = args;
  const commandText = textParts.join(' ');
  const fullPath = join(conversation.cwd || '/workspace', commandPath);

  try {
    if (commandText) {
      await writeFile(fullPath, commandText, 'utf-8');
    } else {
      await readFile(fullPath, 'utf-8'); // Validate exists
    }
    await codebaseDb.registerCommand(conversation.codebase_id, commandName, { path: commandPath, description: `Custom: ${commandName}` });
    return { success: true, message: `Command '${commandName}' registered!\nPath: ${commandPath}` };
  } catch (error) {
    return { success: false, message: `Failed: ${(error as Error).message}` };
  }
}
```

**Case: load-commands**
```typescript
case 'load-commands': {
  if (!args.length) return { success: false, message: 'Usage: /load-commands <folder>' };
  if (!conversation.codebase_id) return { success: false, message: 'No codebase configured.' };

  const folderPath = args.join(' ');
  const fullPath = join(conversation.cwd || '/workspace', folderPath);

  try {
    const files = (await readdir(fullPath)).filter(f => f.endsWith('.md'));
    if (!files.length) return { success: false, message: `No .md files in ${folderPath}` };

    const commands = await codebaseDb.getCodebaseCommands(conversation.codebase_id);
    files.forEach(file => {
      commands[basename(file, '.md')] = { path: join(folderPath, file), description: `From ${folderPath}` };
    });
    await codebaseDb.updateCodebaseCommands(conversation.codebase_id, commands);

    return { success: true, message: `Loaded ${files.length} commands: ${files.map(f => basename(f, '.md')).join(', ')}` };
  } catch (error) {
    return { success: false, message: `Failed: ${(error as Error).message}` };
  }
}
```

**Case: commands**
```typescript
case 'commands': {
  if (!conversation.codebase_id) return { success: false, message: 'No codebase configured.' };

  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  const commands = codebase?.commands || {};

  if (!Object.keys(commands).length) {
    return { success: true, message: `No commands registered.\n\nUse /command-set or /load-commands.` };
  }

  let msg = `Registered Commands:\n\n`;
  for (const [name, def] of Object.entries(commands)) {
    msg += `${name} - ${def.path}\n`;
  }
  return { success: true, message: msg };
}
```

**Update /help:**
```typescript
case 'help':
  return {
    success: true,
    message: `Available Commands:

Command Management:
  /command-set <name> <path> [text] - Register command
  /load-commands <folder> - Bulk load
  /command-invoke <name> [args] - Execute
  /commands - List registered

Codebase:
  /clone <repo> - Clone repository
  /getcwd - Show working directory
  /setcwd <path> - Set directory

Session:
  /status - Show state
  /reset - Clear session
  /help - Show help`
  };
```

**Add tests** to command-handler.test.ts:
```typescript
test('parses /command-set', () => {
  const result = parseCommand('/command-set prime .claude/prime.md');
  expect(result.command).toBe('command-set');
  expect(result.args).toEqual(['prime', '.claude/prime.md']);
});

test('parses /load-commands', () => {
  const result = parseCommand('/load-commands .claude/commands');
  expect(result.command).toBe('load-commands');
  expect(result.args).toEqual(['.claude/commands']);
});
```

**VALIDATE:** `npm test -- src/handlers/command-handler.test.ts`

---

### UPDATE src/orchestrator/orchestrator.ts - Command invoke (CRITICAL)

This is the most complex change. Pay careful attention to the flow.

**Add imports:**
```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import { substituteVariables } from '../utils/variable-substitution';
import * as codebaseDb from '../db/codebases';
```

**Replace slash command handling section (lines 24-35):**
```typescript
// Handle slash commands (except /command-invoke which needs AI)
if (message.startsWith('/')) {
  if (!message.startsWith('/command-invoke')) {
    console.log(`[Orchestrator] Processing slash command: ${message}`);
    const result = await commandHandler.handleCommand(conversation, message);
    await platform.sendMessage(conversationId, result.message);
    if (result.modified) {
      conversation = await db.getOrCreateConversation('telegram', conversationId);
    }
    return;
  }
  // /command-invoke falls through to AI handling
}
```

**Replace "Require codebase" section (lines 37-44) with command parsing logic:**
```typescript
// Parse /command-invoke if applicable
let promptToSend = message;
let commandName: string | null = null;

if (message.startsWith('/command-invoke')) {
  const parts = message.split(/\s+/);
  if (parts.length < 2) {
    await platform.sendMessage(conversationId, 'Usage: /command-invoke <name> [args...]');
    return;
  }

  commandName = parts[1];
  const args = parts.slice(2);

  if (!conversation.codebase_id) {
    await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
    return;
  }

  // Look up command definition
  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  if (!codebase) {
    await platform.sendMessage(conversationId, 'Codebase not found.');
    return;
  }

  const commandDef = codebase.commands[commandName];
  if (!commandDef) {
    await platform.sendMessage(conversationId, `Command '${commandName}' not found. Use /commands to see available.`);
    return;
  }

  // Read command file
  const cwd = conversation.cwd || codebase.default_cwd;
  const commandFilePath = join(cwd, commandDef.path);

  try {
    const commandText = await readFile(commandFilePath, 'utf-8');

    // Substitute variables (no metadata needed - file-based workflow)
    promptToSend = substituteVariables(commandText, args);

    console.log(`[Orchestrator] Executing '${commandName}' with ${args.length} args`);
  } catch (error) {
    await platform.sendMessage(conversationId, `Failed to read command file: ${(error as Error).message}`);
    return;
  }
} else {
  // Regular message - require codebase
  if (!conversation.codebase_id) {
    await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
    return;
  }
}
```

**Replace session creation logic (lines 49-61):**
```typescript
// Get or create session (handle plan→execute transition)
let session = await sessionDb.getActiveSession(conversation.id);
const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
const cwd = conversation.cwd || codebase?.default_cwd || '/workspace';

// Check for plan→execute transition (requires NEW session per PRD)
const needsNewSession = commandName === 'execute' && session?.metadata?.lastCommand === 'plan';

if (needsNewSession) {
  console.log(`[Orchestrator] Plan→Execute transition: creating new session`);

  if (session) await sessionDb.deactivateSession(session.id);

  session = await sessionDb.createSession({
    conversation_id: conversation.id,
    codebase_id: conversation.codebase_id
  });
} else if (!session) {
  console.log(`[Orchestrator] Creating new session`);
  session = await sessionDb.createSession({
    conversation_id: conversation.id,
    codebase_id: conversation.codebase_id
  });
} else {
  console.log(`[Orchestrator] Resuming session ${session.id}`);
}
```

**Update AI streaming section to use `promptToSend` and track command:**
```typescript
// Send to AI and stream responses
const mode = platform.getStreamingMode();

if (mode === 'stream') {
  for await (const msg of aiClient.sendQuery(promptToSend, cwd, session.assistant_session_id || undefined)) {
    if (msg.type === 'assistant' && msg.content) {
      await platform.sendMessage(conversationId, msg.content);
    } else if (msg.type === 'tool' && msg.toolName) {
      await platform.sendMessage(conversationId, formatToolCall(msg.toolName, msg.toolInput));
    } else if (msg.type === 'result' && msg.sessionId) {
      await sessionDb.updateSession(session.id, msg.sessionId);
    }
  }
} else {
  const buffer: string[] = [];
  for await (const msg of aiClient.sendQuery(promptToSend, cwd, session.assistant_session_id || undefined)) {
    if (msg.type === 'assistant' && msg.content) buffer.push(msg.content);
    else if (msg.type === 'tool' && msg.toolName) buffer.push(formatToolCall(msg.toolName, msg.toolInput));
    else if (msg.type === 'result' && msg.sessionId) await sessionDb.updateSession(session.id, msg.sessionId);
  }
  if (buffer.length) await platform.sendMessage(conversationId, buffer.join('\n\n'));
}

// Track last command in metadata (for plan→execute detection)
if (commandName) {
  await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
}
```

**VALIDATE:** `npm run type-check`

---

### UPDATE src/handlers/command-handler.ts - Enhance /clone

**Add after deactivating session in /clone case (around line 158):**
```typescript
// Detect command folders
let commandFolder: string | null = null;
for (const folder of ['.claude/commands', '.agents/commands']) {
  try {
    await access(join(targetPath, folder));
    commandFolder = folder;
    break;
  } catch { /* ignore */ }
}

let responseMessage = `Repository cloned!\n\nCodebase: ${repoName}\nPath: ${targetPath}\n\nSession reset.`;

if (commandFolder) {
  responseMessage += `\n\n📁 Found: ${commandFolder}/\nUse /load-commands ${commandFolder} to register commands.`;
}

return { success: true, message: responseMessage, modified: true };
```

**VALIDATE:** `npm run type-check`

---

## TESTING & VALIDATION

### Level 1: Type Check & Tests
```bash
npm run type-check  # Must pass with no errors
npm test            # All tests pass (12+ tests)
npm run build       # Successful compilation
```

### Level 2: Manual Testing with Test Adapter

**Start application:**
```bash
docker-compose up -d
docker-compose logs -f app  # Wait for "ready"
```

**Test Scenario 1 - Register & List:**
```bash
# Create test command
curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" \
  -d '{"conversationId":"test-cmd","message":"/command-set test .test.md Task: $1"}'

# Verify response
curl http://localhost:3000/test/messages/test-cmd | jq '.messages[-1].message'
# Expected: "Command 'test' registered!"

# List commands
curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" \
  -d '{"conversationId":"test-cmd","message":"/commands"}'

curl http://localhost:3000/test/messages/test-cmd | jq '.messages[-1].message'
# Expected: Shows "test - .test.md"
```

**Test Scenario 2 - Load Commands:**
```bash
# Prepare workspace with commands
docker-compose exec app mkdir -p /workspace/test-repo/.claude/commands
docker-compose exec app bash -c 'echo "Research codebase" > /workspace/test-repo/.claude/commands/prime.md'

# Set cwd
curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" \
  -d '{"conversationId":"test-load","message":"/setcwd /workspace/test-repo"}'

# Load commands
curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" \
  -d '{"conversationId":"test-load","message":"/load-commands .claude/commands"}'

curl http://localhost:3000/test/messages/test-load | jq '.messages[-1].message'
# Expected: "Loaded 1 commands: prime"
```

**Test Scenario 3 - Invoke with Variables:**
```bash
# Invoke command with args
curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" \
  -d '{"conversationId":"test-invoke","message":"/command-invoke test \"Fix bug\""}'

# Check that Claude received substituted prompt
curl http://localhost:3000/test/messages/test-invoke | jq
# Expected: Multiple messages showing tool calls and Claude response
```

**Clean up:**
```bash
curl -X DELETE http://localhost:3000/test/messages/test-cmd
curl -X DELETE http://localhost:3000/test/messages/test-load
curl -X DELETE http://localhost:3000/test/messages/test-invoke
```

### Level 3: Database Validation
```bash
docker-compose exec postgres psql -U postgres -d remote_coding_agent

SELECT name, commands FROM remote_agent_codebases;
-- Verify commands JSONB populated

SELECT metadata FROM remote_agent_sessions WHERE active = true;
-- Verify lastCommand tracked

\q
```

---

## ACCEPTANCE CRITERIA

- [ ] `/command-set` registers commands (file or inline)
- [ ] `/load-commands` bulk loads from folder
- [ ] `/command-invoke` executes with variable substitution
- [ ] Variables work: `$1`, `$2`, `$ARGUMENTS`
- [ ] Plan→Execute creates new session with plan context
- [ ] Session metadata tracks `lastCommand`
- [ ] `/clone` detects and suggests command folders
- [ ] All validation commands pass
- [ ] Test adapter scenarios verified
- [ ] No regressions in existing features

---

## NOTES

**Orchestrator Complexity - Key Points:**
1. `/command-invoke` must NOT be handled like regular slash commands (it needs AI)
2. Command lookup happens BEFORE session creation (need codebase context)
3. Plan→Execute transition is the ONLY case requiring new session (PRD line 232)
4. `lastCommand` tracking enables transition detection
5. Variable substitution happens after reading file, before sending to AI
6. **File-based workflow**: Commands communicate via files (e.g., execute reads latest plan from `.agents/plans/`)

**Session Transition Logic:**
- Track `lastCommand` in session metadata
- Detect: `commandName === 'execute' && metadata.lastCommand === 'plan'`
- Action: Deactivate old session, create new session
- All other cases: Resume existing or create new (if none exists)

**File-Based Context Passing (Convention over Configuration):**
```
/command-invoke plan "Add dark mode"
→ Plan command instructs Claude: "Create plan at .agents/plans/YYYY-MM-DD-feature.md"
→ Claude uses Write tool to create plan file
→ We track: { lastCommand: 'plan' }

/command-invoke execute
→ Execute command instructs Claude: "Find and read the most recent plan from .agents/plans/"
→ Claude uses Glob to find latest .md file by mtime
→ Claude reads plan and implements
→ New session created (plan→execute transition)
→ No explicit variable needed - Claude finds plan via convention ✓
```

**Why Convention-Based:**
- ✅ No parsing LLM output for file paths
- ✅ More robust (doesn't depend on exact response format)
- ✅ Works even if plan phase partially fails
- ✅ Explicit file locations (easier to debug)
- ✅ Simpler implementation

**Test Adapter Confidence:**
The test adapter eliminates manual Telegram testing uncertainty:
- ✅ Programmatic verification of bot responses
- ✅ Test multiple scenarios without manual interaction
- ✅ Debug issues with actual message content
- ✅ Validate orchestrator flow with real AI and database
