# GitHub Webhooks Implementation Reference

**Use Cases:**
- `@coding-assistant` on issues → Fix issue, create PR
- `@coding-assistant` on PRs → Review PR, provide feedback

**Conversation ID Format:** `{owner}/{repo}#{number}` (e.g., `user/repo#42`)

---

## Setup Instructions

### 1. Create GitHub App

1. Go to **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Fill in:
   - **GitHub App name**: `your-coding-assistant`
   - **Homepage URL**: `https://your-domain.com`
   - **Webhook URL**: `https://your-domain.com/webhooks/github`
   - **Webhook secret**: Generate random string (save this)
3. **Permissions** (Repository permissions):
   - Issues: **Read & write**
   - Pull requests: **Read & write**
   - Contents: **Read & write**
4. **Subscribe to events**:
   - `issues`
   - `issue_comment`
   - `pull_request`
5. **Where can this GitHub App be installed?**: Choose "Any account" or "Only on this account"
6. Click **Create GitHub App**

### 2. Generate Private Key

1. Scroll down to **Private keys** → **Generate a private key**
2. Download the `.pem` file
3. Note the **App ID** at the top of the page

### 3. Install App on Repository

1. Go to **Install App** (left sidebar)
2. Click **Install** next to your account
3. Choose **All repositories** or **Only select repositories**
4. Click **Install**

### 4. Create Personal Access Token (for CLI)

1. Go to **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Select scopes:
   - `repo` (full control)
   - `workflow`
4. Click **Generate token**
5. Copy the token (starts with `ghp_`)

### 5. Configure Environment Variables

```env
# GitHub App (for webhooks)
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
WEBHOOK_SECRET=your-webhook-secret-from-step-1

# Personal Access Token (for gh CLI)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Note:** For `GITHUB_PRIVATE_KEY`, you can either:
- Store the entire PEM file content in the env var
- Store the file path and read it in code: `fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH)`

### 6. Test Webhook

1. Create an issue in your test repository
2. Comment `@your-coding-assistant help`
3. Check webhook delivery logs: **GitHub App Settings** → **Advanced** → **Recent Deliveries**
4. Verify your endpoint received the webhook

---

## Signature Verification

```typescript
import crypto from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(payload, 'utf-8').digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Express endpoint
app.post('/webhooks/github', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = req.body.toString('utf-8');

  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  handleWebhook(JSON.parse(payload));
  res.status(200).send('OK');
});
```

---

## Webhook Events

**Key Events:**
- `issue_comment` - Comments on issues/PRs
- `issues` - Issue opened (check body for @mention)
- `pull_request` - PR opened (check body for @mention)

**Key Payload Fields:**
```typescript
event.action              // "created", "opened", etc.
event.issue?.number       // Issue number
event.pull_request?.number // PR number
event.comment?.body       // Comment text
event.issue?.body         // Issue description
event.pull_request?.body  // PR description
event.repository.full_name // "owner/repo"
event.issue?.pull_request // Present if on PR
```

---

## @Mention Detection

```typescript
function parseMention(event: any): { action: 'fix-issue' | 'review-pr', conversationId: string } | null {
  const mention = '@coding-assistant';
  let text = '', isPR = false, number = 0;

  if (event.action === 'created' && event.comment?.body.includes(mention)) {
    isPR = !!event.issue.pull_request;
    number = event.issue.number;
    text = event.comment.body;
  } else if (event.action === 'opened' && event.issue?.body?.includes(mention)) {
    number = event.issue.number;
    text = event.issue.body;
  } else if (event.action === 'opened' && event.pull_request?.body?.includes(mention)) {
    isPR = true;
    number = event.pull_request.number;
    text = event.pull_request.body;
  } else {
    return null;
  }

  return {
    action: isPR ? 'review-pr' : 'fix-issue',
    conversationId: `${event.repository.full_name}#${number}`
  };
}
```

---

## Workflows

**Fix Issue:**
1. Webhook receives issue comment with @mention
2. Parse → action='fix-issue', conversationId='user/repo#42'
3. Clone repo, load codebase context
4. AI analyzes issue, makes changes, commits
5. `gh pr create --title "Fix #42" --body "Fixes #42"`
6. Comment on issue with PR link

**Review PR:**
1. Webhook receives PR comment with @mention
2. Parse → action='review-pr', conversationId='user/repo#15'
3. Fetch PR diff: `gh pr diff 15`
4. AI reviews code, generates feedback
5. `gh pr review 15 --comment -b "feedback"`

---

## GitHub CLI Operations

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Clone repository
async function cloneRepo(fullName: string, workspace: string) {
  const repoPath = `${workspace}/${fullName.split('/')[1]}`;
  await execAsync(`git clone https://github.com/${fullName}.git ${repoPath}`);
  return repoPath;
}

// Create pull request
async function createPR(repoPath: string, issueNum: number, title: string, body: string) {
  await execAsync(`git checkout -b fix/issue-${issueNum}`, { cwd: repoPath });
  await execAsync(`git push -u origin fix/issue-${issueNum}`, { cwd: repoPath });
  const { stdout } = await execAsync(
    `gh pr create --title "${title}" --body "${body} Fixes #${issueNum}"`,
    { cwd: repoPath }
  );
  return stdout.trim();
}

// Comment on issue
async function commentOnIssue(repoPath: string, num: number, comment: string) {
  await execAsync(`gh issue comment ${num} --body "${comment}"`, { cwd: repoPath });
}

// Review pull request
async function reviewPR(repoPath: string, num: number, body: string, approve = false) {
  const flag = approve ? '--approve' : '--comment';
  await execAsync(`gh pr review ${num} ${flag} --body "${body}"`, { cwd: repoPath });
}

// Get PR diff
async function getPRDiff(repoPath: string, num: number): Promise<string> {
  const { stdout } = await execAsync(`gh pr diff ${num}`, { cwd: repoPath });
  return stdout;
}
```

---

## GitHub Adapter

```typescript
export class GitHubAdapter implements IPlatformAdapter {
  constructor(private workspace: string) {}

  async sendMessage(conversationId: string, message: string): Promise<void> {
    const [fullName, num] = conversationId.split('#');
    const repoPath = await this.ensureRepo(fullName);
    await commentOnIssue(repoPath, parseInt(num), message);
  }

  getConversationId(event: any): string {
    const num = event.issue?.number || event.pull_request?.number;
    return `${event.repository.full_name}#${num}`;
  }

  private async ensureRepo(fullName: string): Promise<string> {
    const repoPath = `${this.workspace}/${fullName.split('/')[1]}`;
    try {
      await execAsync('git status', { cwd: repoPath });
      return repoPath;
    } catch {
      return await cloneRepo(fullName, this.workspace);
    }
  }
}
```

---

## Response Strategy

**For MVP:** Post single comment after AI completes (no streaming). GitHub rate limit: 5000 requests/hour.

```typescript
const response = await orchestrator.handleMessage(conversationId, context);
await githubAdapter.sendMessage(conversationId, response);
```

---

## Error Handling

```typescript
async function handleWebhook(event: any) {
  const trigger = parseMention(event);
  if (!trigger) return;

  try {
    await orchestrator.handleMessage('github', trigger.conversationId, context);
  } catch (error) {
    const [fullName, num] = trigger.conversationId.split('#');
    const repoPath = await ensureRepo(fullName);
    await commentOnIssue(repoPath, parseInt(num), `❌ Error: ${error.message}`);
  }
}
```

---

## Local Testing

**Use ngrok for webhooks:**
```bash
ngrok http 3000
# Set https://abc123.ngrok.io/webhooks/github as webhook URL
```

**View delivery logs:** GitHub App Settings → Advanced → Recent Deliveries

---

## Summary

- Verify signatures with HMAC SHA-256 (`crypto.timingSafeEqual`)
- Parse @mentions from `issue_comment`, `issues`, `pull_request` events
- Conversation ID format: `owner/repo#number`
- Use `gh` CLI for all operations (clone, PR, comment, review)
- Single comment response for MVP (no streaming)
