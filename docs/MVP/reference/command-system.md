# Command System

Guide to the generic command system for custom AI workflows.

## Overview

The command system allows users to define custom AI workflows in Git-versioned markdown files. Commands are **not stored in the database** - only their paths and metadata.

### Architecture Flow

```
User: /command-invoke plan "Add dark mode"
       ↓
Orchestrator: Parse command + args
       ↓
Read file: .claude/commands/plan.md
       ↓
Variable substitution: $1 → "Add dark mode"
       ↓
Send to AI client
```

## Command Storage

**Database field:** `remote_agent_codebases.commands` (JSONB)

```json
{
  "prime": {
    "path": ".claude/commands/prime.md",
    "description": "Research codebase"
  },
  "plan": {
    "path": ".claude/commands/plan-feature.md",
    "description": "Create implementation plan"
  }
}
```

**Key principle:** Commands are Git-versioned files. Database stores only paths.

## Command Registration

### Manual Registration

```bash
# Register existing file
/command-set prime .claude/commands/prime.md

# Create file inline
/command-set analyze .claude/commands/analyze.md "You are an expert analyzer. Analyze: $1"
```

**Implementation:** `src/handlers/command-handler.ts:249-280`

### Bulk Loading

```bash
# Load all .md files from folder
/load-commands .claude/commands
```

**Implementation:** `src/handlers/command-handler.ts:282-317`

### Auto-Detection

Triggered by `/clone` command or GitHub webhook. Detects `.claude/commands/` or `.agents/commands/` folders.

**Reference:** `src/adapters/github.ts:266-293`

## Variable Substitution

**Location:** `src/utils/variable-substitution.ts`

**Supported variables:**
- `$1`, `$2`, `$3`, ... - Positional arguments
- `$ARGUMENTS` - All arguments as single string
- `\$` - Escaped dollar sign (literal `$`)

**Example:**

Command file:
```markdown
Analyze: $1

Focus area: $ARGUMENTS
```

Invocation:
```bash
/command-invoke analyze "security" "authentication" "authorization"
```

Result:
```markdown
Analyze: security

Focus area: security authentication authorization
```

## Command Execution Flow

**Location:** `src/orchestrator/orchestrator.ts:44-100`

```typescript
// Parse /command-invoke
if (message.startsWith('/command-invoke')) {
  const [_, commandName, ...args] = message.split(/\s+/);

  // Look up command definition
  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  const commandDef = codebase.commands[commandName];

  // Read and substitute variables
  const commandText = await readFile(join(cwd, commandDef.path), 'utf-8');
  const prompt = substituteVariables(commandText, args);

  // Send to AI client
  for await (const msg of aiClient.sendQuery(prompt, cwd, sessionId)) {
    // Stream or batch responses
  }
}
```

## Slash Command Routing

**Deterministic commands** (handled by Command Handler):
- `/help`, `/status`, `/getcwd`, `/setcwd`, `/clone`, `/repos`
- `/command-set`, `/load-commands`, `/commands`, `/reset`

**AI-invoked commands:**
- `/command-invoke <name> [args...]`

### Clone Command Auto-Detection

The `/clone` command auto-detects AI assistant type based on folder structure:

```typescript
// Check for .codex folder → use codex
// Check for .claude folder → use claude
// Default to claude if neither found
```

**Reference:** `src/handlers/command-handler.ts:177-195`

**Routing logic** (`src/orchestrator/orchestrator.ts:28-42`):

```typescript
if (message.startsWith('/')) {
  if (!message.startsWith('/command-invoke')) {
    // Handle deterministic command
    const result = await commandHandler.handleCommand(conversation, message);
    await platform.sendMessage(conversationId, result.message);
    return;
  }
  // /command-invoke falls through to AI handling
}
```

## Session Tracking

**Track last command** for plan→execute detection:

```typescript
// After command execution
await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
```

**Location:** `src/orchestrator/orchestrator.ts:231-233`

**Plan→execute transition** (requires new session per PRD):

```typescript
const needsNewSession =
  commandName === 'execute' &&
  session?.metadata?.lastCommand === 'plan-feature';

if (needsNewSession) {
  await sessionDb.deactivateSession(session.id);
  session = await sessionDb.createSession({...});
}
```

**Location:** `src/orchestrator/orchestrator.ts:122-136`

## Database Operations

```typescript
// Get codebase commands
const commands = await codebaseDb.getCodebaseCommands(codebaseId);

// Register single command
await codebaseDb.registerCommand(codebaseId, 'analyze', {
  path: '.claude/commands/analyze.md',
  description: 'Analyze codebase',
});

// Bulk update commands
await codebaseDb.updateCodebaseCommands(codebaseId, {
  prime: { path: '.claude/commands/prime.md', description: 'Research' },
  plan: { path: '.claude/commands/plan.md', description: 'Plan feature' },
});
```

## Command File Best Practices

**Structure:**

```markdown
# System instructions (optional)
You are an expert [domain] engineer.

# Task description with variables
[Action verb] the following: $1

# Output format (optional)
Provide:
1. [Output item 1]
2. [Output item 2]

# Additional context (optional)
Focus on: $ARGUMENTS
```

**GitHub context injection:**

For GitHub issues/PRs, context is automatically appended after variable substitution:

```typescript
let prompt = substituteVariables(commandText, args);

// Append issue/PR context if provided
if (issueContext) {
  prompt = prompt + '\n\n---\n\n' + issueContext;
}
```

**Location:** `src/orchestrator/orchestrator.ts:89-93`

## Reference Files

- **Command Handler**: `src/handlers/command-handler.ts`
- **Variable Substitution**: `src/utils/variable-substitution.ts`
- **Orchestrator**: `src/orchestrator/orchestrator.ts`
- **Database (codebases)**: `src/db/codebases.ts`
