# Feature: GitHub Platform Adapter

Add GitHub integration via webhooks. Users @mention `@remote-agent` in issues/PRs to interact with AI coding assistant. Conversations are repository-scoped with automatic cloning and context injection.

## User Story

As a developer working on GitHub issues and pull requests
I want to @mention the AI coding assistant in comments
So that I can get AI-powered code analysis, reviews, and implementation help directly in my GitHub workflow

## Feature Metadata

**Feature Type**: New Capability
**Complexity**: Medium
**Systems Affected**: Platform adapters, Database, Express routes, Environment config
**Dependencies**: @octokit/rest (^22.0.0), @octokit/webhooks-methods (^6.0.0)

---

## CONTEXT REFERENCES

### Must Read Before Implementing

**Codebase Files:**
- `src/adapters/telegram.ts` - Reference IPlatformAdapter implementation
- `src/types/index.ts:49-69` - IPlatformAdapter interface
- `src/handlers/command-handler.ts:147-161` - Git clone auth pattern
- `src/db/conversations.ts:7-26` - getOrCreateConversation pattern
- `src/orchestrator/orchestrator.ts:15-181` - Message handling flow

**Documentation:**
- [GitHub Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads) - Payload structure
- [@octokit/webhooks-methods](https://github.com/octokit/webhooks-methods.js) - Signature verification
- [@octokit/rest Docs](https://octokit.github.io/rest.js/) - API methods

### Files to Create/Modify

**New:**
- `src/adapters/github.ts` (~350 lines)
- `src/adapters/github.test.ts` (~150 lines)

**Modify:**
- `src/index.ts` (+50 lines - webhook endpoint)
- `src/db/codebases.ts` (+10 lines - findCodebaseByRepoUrl)
- `package.json` (+2 dependencies)
- `.env.example` (+3 env vars)

### Key Patterns

**Naming**: PascalCase classes, camelCase functions, kebab-case files
**Error Handling**: Try-catch with structured logging, never throw from sendMessage
**Logging**: `console.log('[Component] Action', { context })`
**Database**: Parameterized queries ($1, $2), never string concatenation

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation
- Add @octokit dependencies to package.json
- Add GitHub env vars to .env.example
- Create github.ts skeleton implementing IPlatformAdapter

### Phase 2: Core Adapter
- Webhook signature verification (HMAC SHA-256)
- Event parsing (issues, issue_comment, pull_request)
- @mention detection and stripping
- ConversationId format: `owner/repo#number`
- Post comments via octokit.rest.issues.createComment

### Phase 3: Repository Management
- Add findCodebaseByRepoUrl() to db/codebases.ts
- Implement ensureRepoReady() (clone if new, fetch+reset if exists)
- Auto-detect .claude/commands or .agents/commands
- Codebase reuse across issues/PRs in same repo

### Phase 4: Context Injection
- Build issue context (title, author, labels, body)
- Build PR context (title, changed files, body)
- Inject only on NEW conversations (first message)

### Phase 5: Integration
- Add POST /webhooks/github to Express
- Use express.raw() middleware for signature verification
- Initialize GitHubAdapter conditionally (if GITHUB_TOKEN + WEBHOOK_SECRET)
- Route verified webhooks to adapter.handleWebhook() (async, fire-and-forget)

### Phase 6: Testing
- Unit tests (webhook parsing, signature, conversationId)
- Type checking, linting, formatting
- Manual validation with GitHub CLI (see GitHub CLI Testing section)

---

## STEP-BY-STEP TASKS

### 1. UPDATE package.json - Add Dependencies

```json
"dependencies": {
  "@octokit/rest": "^22.0.0",
  "@octokit/webhooks-methods": "^6.0.0",
  // ... existing
}
```

**VALIDATE**: `npm install && npm list @octokit/rest @octokit/webhooks-methods`

### 2. UPDATE .env.example - GitHub Config

```env
# GitHub Webhooks
GITHUB_TOKEN=ghp_...
WEBHOOK_SECRET=random_secret_string
```

**VALIDATE**: Visual inspection

### 3. CREATE src/adapters/github.ts - Skeleton

```typescript
import { Octokit } from '@octokit/rest';
import { verify } from '@octokit/webhooks-methods';
import { IPlatformAdapter, IAssistantClient } from '../types';
import { handleMessage } from '../orchestrator/orchestrator';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, access } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export class GitHubAdapter implements IPlatformAdapter {
  private octokit: Octokit;
  private webhookSecret: string;

  constructor(token: string, webhookSecret: string) {
    this.octokit = new Octokit({ auth: token });
    this.webhookSecret = webhookSecret;
    console.log('[GitHub] Adapter initialized');
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    // TODO: Implement
  }

  getStreamingMode(): 'batch' {
    return 'batch';
  }

  async start(): Promise<void> {}
  stop(): void {}

  async handleWebhook(payload: string, signature: string, aiClient: IAssistantClient): Promise<void> {
    // TODO: Implement
  }
}
```

**VALIDATE**: `npm run type-check`

### 4. ADD Signature Verification

```typescript
private async verifySignature(payload: string, signature: string): Promise<boolean> {
  try {
    return await verify(this.webhookSecret, payload, signature);
  } catch (error) {
    console.error('[GitHub] Signature verification error:', error);
    return false;
  }
}
```

**VALIDATE**: Unit test with known signature

### 5. ADD Webhook Event Parsing

```typescript
interface WebhookEvent {
  action: string;
  issue?: { number: number; title: string; body: string; user: { login: string }; labels: Array<{ name: string }>; state: string };
  pull_request?: { number: number; title: string; body: string; user: { login: string }; state: string; changed_files?: number; additions?: number; deletions?: number };
  comment?: { body: string; user: { login: string } };
  repository: { owner: { login: string }; name: string; full_name: string; html_url: string; default_branch: string };
  sender: { login: string };
}

private parseEvent(event: WebhookEvent): {
  owner: string;
  repo: string;
  number: number;
  comment: string;
  eventType: 'issue' | 'issue_comment' | 'pull_request';
  issue?: WebhookEvent['issue'];
  pullRequest?: WebhookEvent['pull_request'];
} | null {
  const owner = event.repository.owner.login;
  const repo = event.repository.name;

  // issue_comment (covers both issues and PRs)
  if (event.comment) {
    const number = event.issue?.number || event.pull_request?.number;
    if (!number) return null;
    return { owner, repo, number, comment: event.comment.body, eventType: 'issue_comment', issue: event.issue, pullRequest: event.pull_request };
  }

  // issues.opened
  if (event.issue && event.action === 'opened') {
    return { owner, repo, number: event.issue.number, comment: event.issue.body || '', eventType: 'issue', issue: event.issue };
  }

  // pull_request.opened
  if (event.pull_request && event.action === 'opened') {
    return { owner, repo, number: event.pull_request.number, comment: event.pull_request.body || '', eventType: 'pull_request', pullRequest: event.pull_request };
  }

  return null;
}
```

**VALIDATE**: Unit test with sample payloads

### 6. ADD @Mention Detection

```typescript
private hasMention(text: string): boolean {
  return /@remote-agent[\s,:;]/.test(text) || text.trim() === '@remote-agent';
}

private stripMention(text: string): string {
  return text.replace(/@remote-agent[\s,:;]+/g, '').trim();
}
```

**VALIDATE**: Unit test with variations

### 7. ADD ConversationId Helpers

```typescript
private buildConversationId(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}

private parseConversationId(conversationId: string): { owner: string; repo: string; number: number } | null {
  const match = conversationId.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}
```

**VALIDATE**: Unit test round-trip

### 8. ADD sendMessage Implementation

```typescript
async sendMessage(conversationId: string, message: string): Promise<void> {
  const parsed = this.parseConversationId(conversationId);
  if (!parsed) {
    console.error('[GitHub] Invalid conversationId:', conversationId);
    return;
  }

  try {
    await this.octokit.rest.issues.createComment({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: parsed.number,
      body: message,
    });
    console.log(`[GitHub] Comment posted to ${conversationId}`);
  } catch (error) {
    console.error('[GitHub] Failed to post comment:', { error, conversationId });
  }
}
```

**VALIDATE**: Manual test with real issue

### 9. ADD src/db/codebases.ts - findCodebaseByRepoUrl

```typescript
export async function findCodebaseByRepoUrl(repoUrl: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE repository_url = $1',
    [repoUrl]
  );
  return result.rows[0] || null;
}
```

**VALIDATE**: `npm run type-check`

### 10. ADD Repository Sync Helper

```typescript
private async ensureRepoReady(owner: string, repo: string, defaultBranch: string, isNewConversation: boolean): Promise<string> {
  const repoName = `${owner}-${repo}`;
  const repoPath = `/workspace/${repoName}`;

  try {
    await access(repoPath);
    if (isNewConversation) {
      console.log(`[GitHub] Syncing repository`);
      await execAsync(`cd ${repoPath} && git fetch origin && git reset --hard origin/${defaultBranch}`);
    }
  } catch {
    console.log(`[GitHub] Cloning repository to ${repoPath}`);
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const repoUrl = `https://github.com/${owner}/${repo}.git`;
    let cloneCommand = `git clone ${repoUrl} ${repoPath}`;

    if (ghToken) {
      const authenticatedUrl = `https://${ghToken}@github.com/${owner}/${repo}.git`;
      cloneCommand = `git clone ${authenticatedUrl} ${repoPath}`;
    }

    await execAsync(cloneCommand);
    await execAsync(`git config --global --add safe.directory ${repoPath}`);
  }

  return repoPath;
}
```

**VALIDATE**: Check /workspace after execution

### 11. ADD Auto-Detect Commands

```typescript
private async autoDetectAndLoadCommands(repoPath: string, codebaseId: string): Promise<void> {
  const commandFolders = ['.claude/commands', '.agents/commands'];

  for (const folder of commandFolders) {
    try {
      const fullPath = join(repoPath, folder);
      await access(fullPath);

      const files = (await readdir(fullPath)).filter((f) => f.endsWith('.md'));
      if (files.length === 0) continue;

      const commands = await codebaseDb.getCodebaseCommands(codebaseId);
      files.forEach((file) => {
        commands[file.replace('.md', '')] = {
          path: join(folder, file),
          description: `From ${folder}`,
        };
      });

      await codebaseDb.updateCodebaseCommands(codebaseId, commands);
      console.log(`[GitHub] Loaded ${files.length} commands from ${folder}`);
      return;
    } catch {
      continue;
    }
  }
}
```

**VALIDATE**: Check database after execution

### 12. ADD Codebase Management

```typescript
private async getOrCreateCodebaseForRepo(owner: string, repo: string, repoPath: string): Promise<{ codebase: any; isNew: boolean }> {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const existing = await codebaseDb.findCodebaseByRepoUrl(repoUrl);

  if (existing) {
    console.log(`[GitHub] Using existing codebase: ${existing.name}`);
    return { codebase: existing, isNew: false };
  }

  const codebase = await codebaseDb.createCodebase({
    name: `${owner}-${repo}`,
    repository_url: repoUrl,
    default_cwd: repoPath,
  });

  console.log(`[GitHub] Created new codebase: ${codebase.name}`);
  return { codebase, isNew: true };
}
```

**VALIDATE**: Check database for duplicates

### 13. ADD Context Builders

```typescript
private buildIssueContext(issue: WebhookEvent['issue'], userComment: string): string {
  if (!issue) return userComment;
  const labels = issue.labels.map((l) => l.name).join(', ');

  return `[GitHub Issue Context]
Issue #${issue.number}: "${issue.title}"
Author: ${issue.user.login}
Labels: ${labels}
Status: ${issue.state}

Description:
${issue.body}

---

${userComment}`;
}

private buildPRContext(pr: WebhookEvent['pull_request'], userComment: string): string {
  if (!pr) return userComment;
  const stats = pr.changed_files ? `Changed files: ${pr.changed_files} (+${pr.additions}, -${pr.deletions})` : '';

  return `[GitHub Pull Request Context]
PR #${pr.number}: "${pr.title}"
Author: ${pr.user.login}
Status: ${pr.state}
${stats}

Description:
${pr.body}

Use 'gh pr diff ${pr.number}' to see detailed changes.

---

${userComment}`;
}
```

**VALIDATE**: Visual inspection of markdown

### 14. ADD handleWebhook Implementation

```typescript
async handleWebhook(payload: string, signature: string, aiClient: IAssistantClient): Promise<void> {
  // 1. Verify signature
  if (!(await this.verifySignature(payload, signature))) {
    console.error('[GitHub] Invalid webhook signature');
    return;
  }

  // 2. Parse event
  const event: WebhookEvent = JSON.parse(payload);
  const parsed = this.parseEvent(event);
  if (!parsed) return;

  const { owner, repo, number, comment, eventType, issue, pullRequest } = parsed;

  // 3. Check @mention
  if (!this.hasMention(comment)) return;

  console.log(`[GitHub] Processing ${eventType}: ${owner}/${repo}#${number}`);

  // 4. Build conversationId
  const conversationId = this.buildConversationId(owner, repo, number);

  // 5. Check if new conversation
  const existingConv = await db.getOrCreateConversation('github', conversationId);
  const isNewConversation = !existingConv.codebase_id;

  // 6. Get default branch
  const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  // 7. Ensure repo ready
  const repoPath = await this.ensureRepoReady(owner, repo, defaultBranch, isNewConversation);

  // 8. Get/create codebase
  const { codebase, isNew: isNewCodebase } = await this.getOrCreateCodebaseForRepo(owner, repo, repoPath);

  // 9. Auto-load commands if new
  if (isNewCodebase) {
    await this.autoDetectAndLoadCommands(repoPath, codebase.id);
  }

  // 10. Update conversation
  if (isNewConversation) {
    await db.updateConversation(existingConv.id, {
      codebase_id: codebase.id,
      cwd: repoPath,
    });
  }

  // 11. Build message with context if new
  const strippedComment = this.stripMention(comment);
  let finalMessage = strippedComment;

  if (isNewConversation) {
    if (eventType === 'issue' || (eventType === 'issue_comment' && issue)) {
      finalMessage = this.buildIssueContext(issue!, strippedComment);
    } else if (eventType === 'pull_request' || (eventType === 'issue_comment' && pullRequest)) {
      finalMessage = this.buildPRContext(pullRequest!, strippedComment);
    }
  }

  // 12. Route to orchestrator
  try {
    await handleMessage(this, aiClient, conversationId, finalMessage);
  } catch (error) {
    console.error('[GitHub] Message handling error:', error);
    await this.sendMessage(conversationId, '⚠️ An error occurred. Please try again or use /reset.');
  }
}
```

**VALIDATE**: Integration test with sample payload

### 15. UPDATE src/index.ts - Webhook Endpoint

Add after health checks, before test adapter:

```typescript
// GitHub webhook endpoint (must use raw body for signature verification)
if (github) {
  app.post('/webhooks/github', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!signature) {
        return res.status(400).json({ error: 'Missing signature header' });
      }

      const payload = req.body.toString('utf-8');

      // Process async (fire-and-forget for fast webhook response)
      github.handleWebhook(payload, signature, claude).catch((error) => {
        console.error('[GitHub] Webhook processing error:', error);
      });

      return res.status(200).send('OK');
    } catch (error) {
      console.error('[GitHub] Webhook endpoint error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  console.log('[Express] GitHub webhook endpoint registered');
}
```

**VALIDATE**: `npm run dev`

### 16. UPDATE src/index.ts - Initialize Adapter

Add after Express setup:

```typescript
// Initialize GitHub adapter (conditional)
let github: GitHubAdapter | null = null;
if (process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET) {
  github = new GitHubAdapter(process.env.GITHUB_TOKEN, process.env.WEBHOOK_SECRET);
  console.log('[GitHub] Adapter initialized');
} else {
  console.log('[GitHub] Adapter not initialized (missing GITHUB_TOKEN or WEBHOOK_SECRET)');
}
```

Add import: `import { GitHubAdapter } from './adapters/github';`

**VALIDATE**: Start with/without GitHub env vars

### 17. CREATE src/adapters/github.test.ts - Unit Tests

```typescript
import { GitHubAdapter } from './github';

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter('fake-token', 'fake-secret');
  });

  describe('conversationId', () => {
    it('should build and parse conversationId', () => {
      // Test buildConversationId and parseConversationId
    });
  });

  describe('@mention detection', () => {
    it('should detect and strip mentions', () => {
      // Test hasMention and stripMention
    });
  });

  describe('webhook parsing', () => {
    it('should parse issue_comment event', () => {
      // Test parseEvent
    });

    it('should return null for unsupported events', () => {
      // Test parseEvent
    });
  });
});
```

**VALIDATE**: `npm test src/adapters/github.test.ts`

### 18. VALIDATE Installation

```bash
npm install
npm run type-check
npm run build
```

### 19. VALIDATE Linting & Formatting

```bash
npm run lint
npm run format:check
```

### 20. UPDATE README.md - GitHub Setup Instructions

Add GitHub integration section to README.md after Telegram Commands section:

```markdown
## GitHub Integration

### Prerequisites

- GitHub repository with issues enabled
- GitHub personal access token with `repo` scope
- Public endpoint for webhooks (ngrok for development, or deployed server)

### Setup

**1. Create GitHub Personal Access Token**

Visit [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
- Click "Generate new token (classic)"
- Select scopes: `repo` (full control of private repositories)
- Copy token (starts with `ghp_...`)

**2. Configure Environment Variables**

```env
# .env
GITHUB_TOKEN=ghp_your_token_here
WEBHOOK_SECRET=your_random_secret_string
```

**3. Configure GitHub Webhook**

In your repository settings:
- Go to Settings > Webhooks > Add webhook
- **Payload URL**: `https://your-domain.com/webhooks/github`
- **Content type**: `application/json`
- **Secret**: Same value as `WEBHOOK_SECRET` in `.env`
- **Events**: Select "Let me select individual events"
  - ✓ Issues
  - ✓ Issue comments
  - ✓ Pull requests
- Click "Add webhook"

### Usage

**Interact with AI by @mentioning in issues or PRs:**

```
@remote-agent can you analyze this bug?
@remote-agent /status
@remote-agent review this implementation
```

**First mention in an issue/PR**:
- Automatically clones repository
- Detects and loads commands from `.claude/commands` or `.agents/commands`
- Injects issue/PR context for Claude

**Subsequent mentions**:
- Resumes conversation
- No context re-injection

**Response Mode**: Batch (single comment, no streaming)
```

**VALIDATE**: Visual inspection - ensure formatting matches existing README style

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
npm run type-check
npm run lint
npm run format:check
```

### Level 2: Unit Tests

```bash
npm test
npm test src/adapters/github.test.ts
```

### Level 3: Build & Start

```bash
npm run build
npm run dev
curl http://localhost:3000/health
```

### Level 4: Database Validation

```bash
# Check GitHub conversations
psql $DATABASE_URL -c "SELECT * FROM remote_agent_conversations WHERE platform_type='github';"

# Check codebases
psql $DATABASE_URL -c "SELECT name, repository_url FROM remote_agent_codebases WHERE repository_url LIKE '%github%';"
```

---

## GITHUB CLI TESTING

**When Ready**: After completing all automated validation (unit tests, linting, type-check, build), notify user for GitHub CLI testing setup.

**User Setup**:
1. User updates `.env` with `GITHUB_TOKEN` and `WEBHOOK_SECRET`
2. User provides test repository URL (should have issues enabled)
3. User configures GitHub webhook pointing to application endpoint

**Test Workflow**:

```bash
# 1. Start application
npm run dev

# 2. Create test issue via GitHub CLI
gh issue create --repo REPO_URL --title "Test Issue" --body "Testing remote-agent integration"

# 3. Comment on issue with @mention (simple test - read file)
gh issue comment ISSUE_NUMBER --repo REPO_URL --body "@remote-agent can you read the README.md and tell me what this repo does?"

# 4. Verify webhook received
# Check logs: docker-compose logs -f app
# Check database: psql $DATABASE_URL -c "SELECT * FROM remote_agent_conversations WHERE platform_type='github';"
# Check workspace: ls /workspace/ (should see cloned repo)

# 5. Verify bot response posted to issue
gh issue view ISSUE_NUMBER --repo REPO_URL --comments

# 6. Test existing conversation (should NOT inject context again)
gh issue comment ISSUE_NUMBER --repo REPO_URL --body "@remote-agent /status"

# 7. Clean up test issue
gh issue close ISSUE_NUMBER --repo REPO_URL
```

**Keep Tests Simple**: Only test file reading, basic commands like `/status`, `/commands`. Avoid complex AI operations during validation.

---

## ACCEPTANCE CRITERIA

- [x] GitHubAdapter implements IPlatformAdapter
- [x] HMAC SHA-256 signature verification works
- [x] Webhook events parsed correctly
- [x] @mention detection filters comments
- [x] ConversationId format works bidirectionally
- [x] Repository auto-clones on first mention
- [x] Repository syncs on new conversations only
- [x] Commands auto-loaded from .claude/commands or .agents/commands
- [x] Codebase reused across issues/PRs
- [x] Issue/PR context injected on first message only
- [x] Batch mode enforced
- [x] sendMessage posts comments via GitHub API
- [x] All validation commands pass
- [x] Unit test coverage >80%
- [x] Manual GitHub CLI testing confirms functionality
- [x] No regressions in Telegram adapter
- [x] Environment variables documented

---

## NOTES

**Design Decisions**:
- **Batch Mode Only**: Avoids comment spam (GitHub UX differs from real-time chat)
- **Repository-Scoped**: Conversations permanently bound to repository (simplifies model)
- **Auto-Initialization**: Seamless UX - no manual repo setup required
- **Sync Strategy**: `git fetch && reset --hard` prevents merge conflicts from Claude's changes
- **Async Webhooks**: Fire-and-forget pattern ensures fast webhook response (<10s GitHub timeout)

**Trade-offs**:
- Initial clone delay acceptable (users expect setup time)
- Silent command loading reduces noise in issues
- No command filtering for GitHub (adds complexity, unlikely to cause issues)

**Security**:
- Webhook signature verification required
- Never log full GITHUB_TOKEN
- Parameterized SQL queries ($1, $2)
