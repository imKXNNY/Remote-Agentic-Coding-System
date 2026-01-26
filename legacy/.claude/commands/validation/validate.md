---
argument-hint: [ngrok-url]
description: Run comprehensive end-to-end validation with ngrok URL
---

# Comprehensive End-to-End Validation

Run complete end-to-end validation of the Remote Agentic Coding Platform including Docker, Test Adapter, Database, and GitHub integration testing.

**Usage:**
```bash
/validation:validate <ngrok-url>
```

**Example:**
```bash
/validation:validate https://trinity-nonadverbial-enharmonically.ngrok-free.dev
```

**Prerequisites:**
- ✅ ngrok running and exposing port 3000 (for GitHub webhooks)
- ✅ `.env` file configured with all required credentials
- ✅ GitHub CLI (`gh`) authenticated
- ✅ PostgreSQL accessible via `DATABASE_URL`

**Important:**
- The ngrok URL will be used to configure GitHub webhooks automatically
- The webhook secret from `.env` (WEBHOOK_SECRET) will be used for security

---

## Phase 1: Foundation Validation

Execute basic validation commands first to ensure codebase health.

### 1.1 Type Checking
```bash
npm run type-check
```
**Expected:** No TypeScript errors

### 1.2 Linting
```bash
npm run lint
```
**Expected:** No ESLint errors or warnings

### 1.3 Unit Tests
```bash
npm test
```
**Expected:** All tests pass

### 1.4 Build
```bash
npm run build
```
**Expected:** Clean build, output in `dist/`

**If any step fails, STOP and report the issue immediately.**

---

## Phase 2: Test Repository Setup

Create a private GitHub repository from a minimal Next.js template for end-to-end testing.

### 2.0 Clean Workspace and Database (CRITICAL)
```bash
# IMPORTANT: The workspace directory is mounted as a Docker volume
# We must clean it on the HOST to avoid "directory already exists" errors
# when cloning inside the Docker container

# Remove any previous test repositories
rm -rf workspace/remote-coding-test-*

# Clean up test adapter conversations from database
# This ensures test-e2e conversation uses current DEFAULT_AI_ASSISTANT setting
source .env
docker exec remote-coding-agent-app-1 sh -c "psql '$DATABASE_URL' -c \"DELETE FROM remote_agent_conversations WHERE platform_conversation_id LIKE 'test-%';\""

# Verify cleanup
ls -la workspace/
echo "✅ Workspace and database cleaned"
```

**Why this is needed:**
1. **Workspace cleanup:** The workspace is mounted from the host into the Docker container. If a directory exists on the host, git clone inside the container will fail with "directory already exists".
2. **Database cleanup:** Test adapter conversations (e.g., `test-e2e`) persist across validation runs. Without cleanup, old conversations retain their original `ai_assistant_type` even if `DEFAULT_AI_ASSISTANT` environment variable has changed. This causes the test to use the wrong AI assistant.

### 2.1 Store ngrok URL
```bash
# Store the ngrok URL from command arguments
NGROK_URL="$ARGUMENTS"
echo "Using ngrok URL: ${NGROK_URL}"

# Validate URL format
if [[ ! "$NGROK_URL" =~ ^https://.*\.ngrok-free\.dev$ ]]; then
  echo "ERROR: Invalid ngrok URL format. Expected: https://******.ngrok-free.dev"
  exit 1
fi
```

### 2.2 Generate Repository Name
```bash
# Create timestamp-based repo name
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEST_REPO_NAME="remote-coding-test-${TIMESTAMP}"
echo "Test repository: ${TEST_REPO_NAME}"
```

### 2.3 Create Minimal Next.js App Manually
```bash
# Create workspace directory if needed
mkdir -p workspace
cd workspace
mkdir ${TEST_REPO_NAME}
cd ${TEST_REPO_NAME}

# Initialize git
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Create basic Next.js structure
cat > package.json << 'EOF'
{
  "name": "remote-coding-test",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next": "16.0.1"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
EOF

# Create README
cat > README.md << 'EOF'
# Remote Coding Test Repository

This is a test repository created for automated validation of the Remote Agentic Coding Platform.

## Getting Started

This is a minimal Next.js application used for testing purposes.
EOF

# Create app directory
mkdir -p app

# Create basic page
cat > app/page.tsx << 'EOF'
export default function Home() {
  return (
    <main>
      <h1>Remote Coding Test</h1>
      <p>This is a test application.</p>
    </main>
  );
}
EOF

# Create layout
cat > app/layout.tsx << 'EOF'
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF

# Create tsconfig
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {"@/*": ["./*"]}
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules
.next
.env*.local
EOF

# Add and commit
git add .
git commit -m "Initial commit from manual Next.js setup"

echo "Repository structure created successfully"
```

**Note:** We use manual setup instead of `create-next-app` to avoid interactive prompts and ensure deterministic execution.

### 2.4 Push to Private GitHub Repository
```bash
# Already in workspace/${TEST_REPO_NAME} from previous step
# Git is already initialized and committed

# Create private GitHub repository and push
gh repo create ${TEST_REPO_NAME} --private --source=. --push

# Store repo URL and GitHub username for later use
TEST_REPO_URL=$(gh repo view --json url -q .url)
GITHUB_USERNAME=$(gh api user --jq .login)
echo "Repository created: ${TEST_REPO_URL}"
echo "GitHub user: ${GITHUB_USERNAME}"
```

**Validation:** Verify repository is created and private
```bash
gh repo view ${TEST_REPO_NAME} --json isPrivate -q .isPrivate
# Expected: true
```

### 2.5 Configure GitHub Webhook
```bash
# Return to project root
cd ../..

# Extract webhook secret from .env
source .env

# Create webhook pointing to ngrok URL
gh api repos/${GITHUB_USERNAME}/${TEST_REPO_NAME}/hooks \
  -X POST \
  --input - <<EOF
{
  "name": "web",
  "active": true,
  "events": [
    "issues",
    "issue_comment",
    "pull_request",
    "pull_request_review_comment"
  ],
  "config": {
    "url": "${NGROK_URL}/webhooks/github",
    "content_type": "json",
    "secret": "${WEBHOOK_SECRET}",
    "insecure_ssl": "0"
  }
}
EOF

echo ""
echo "✅ Webhook configured successfully!"
```

**Verify webhook:**
```bash
gh api repos/${GITHUB_USERNAME}/${TEST_REPO_NAME}/hooks | jq '.[0] | {id, url: .config.url, events, active}'
```

**Expected output:**
```json
{
  "id": 123456789,
  "url": "https://******.ngrok-free.dev/webhooks/github",
  "events": ["issues", "issue_comment", "pull_request", "pull_request_review_comment"],
  "active": true
}
```

---

## Phase 3: Docker Container Validation

Rebuild and verify Docker container startup.

### 3.1 Tear Down Existing Container
```bash
cd ../..  # Return to project root
docker-compose down
```

### 3.2 Rebuild and Start Container
```bash
docker-compose up -d --build
```

### 3.3 Verify Startup (Wait 10 seconds)
```bash
sleep 10
docker-compose logs app | tail -50
```

**Check for:**
- ✅ `[ConversationLock] Initialized { maxConcurrent: 10 }`
- ✅ `[Database] Connected successfully`
- ✅ `[App] Remote Coding Agent is ready!`
- ❌ No error stack traces

### 3.4 Health Check Endpoints
```bash
# Basic health
curl http://localhost:3000/health

# Database health
curl http://localhost:3000/health/db

# Concurrency health
curl http://localhost:3000/health/concurrency | jq
```

**Expected:** All return `{"status":"ok",...}`

---

## Phase 4: Test Adapter Validation

Test full orchestrator flow using HTTP API endpoints (no external platforms needed).

### 4.1 Clear Test Adapter Message History
```bash
# Clear in-memory message history (database conversation already cleaned in Phase 2.0)
curl -X DELETE http://localhost:3000/test/messages/test-e2e
```

### 4.2 Send Clone Command
```bash
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"test-e2e\",\"message\":\"/clone https://github.com/${GITHUB_USERNAME}/${TEST_REPO_NAME}\"}"
```

**Wait 5 seconds for clone to complete**
```bash
sleep 5
```

### 4.3 Verify Clone Response
```bash
curl http://localhost:3000/test/messages/test-e2e | jq
```

**Check for:** "Repository cloned successfully" or "Codebase created" message

### 4.4 Send Simple Implementation Request
```bash
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId":"test-e2e",
    "message":"Update the README.md file to add a new section called \"Testing\" with the text \"This repository is used for automated testing.\" Then create a pull request with the title \"Add Testing section to README\"."
  }'
```

**Wait 30 seconds for AI processing**
```bash
sleep 30
```

### 4.5 Check Docker Logs for Processing
```bash
docker-compose logs app | grep -E "Orchestrator|ConversationLock|Tool" | tail -30
```

**Look for:**
- ✅ `[ConversationLock] Starting test-e2e`
- ✅ `[Orchestrator] Starting AI conversation`
- ✅ Tool calls (Read, Edit, Bash for git commands)
- ✅ `[ConversationLock] Completed test-e2e`

### 4.6 Verify Test Adapter Response
```bash
curl http://localhost:3000/test/messages/test-e2e | jq '.messages | last'
```

**Check for:** Summary of changes or confirmation of PR creation

---

## Phase 5: Database Validation

Verify database records are created correctly.

**Note:** We use `docker exec` to run psql because the PostgreSQL client may not be installed on the host machine.

### 5.1 Load DATABASE_URL
```bash
# Extract DATABASE_URL from .env (needed for docker exec)
source .env
```

### 5.2 Check Codebase Record
```bash
# Query via Docker container (psql is installed there)
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, name, repository_url, default_cwd
FROM remote_agent_codebases
WHERE name LIKE '%${TEST_REPO_NAME}%'
ORDER BY created_at DESC
LIMIT 1;
\"
"
```

**Expected:** 1 row with repository details

### 5.3 Check Conversation Record
```bash
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, platform_type, platform_conversation_id, cwd, ai_assistant_type
FROM remote_agent_conversations
WHERE platform_conversation_id = 'test-e2e';
\"
"
```

**Expected:** 1 row with platform_type='test', codebase_id set

### 5.4 Check Session Records
```bash
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, ai_assistant_type, active, assistant_session_id
FROM remote_agent_sessions
WHERE conversation_id IN (
  SELECT id FROM remote_agent_conversations WHERE platform_conversation_id = 'test-e2e'
)
ORDER BY started_at DESC
LIMIT 5;
\"
"
```

**Expected:** At least 1 session record, active=true for latest

---

## Phase 6: GitHub Issue Integration

Test GitHub webhook integration with issue creation and @remote-agent mention.

### 6.1 Create GitHub Issue
```bash
cd workspace/${TEST_REPO_NAME}

ISSUE_URL=$(gh issue create \
  --title "Update README with validation section" \
  --body "We need to add a \"Validation\" section to the README explaining the testing process." \
  | grep -o 'https://.*')

ISSUE_NUMBER=$(echo $ISSUE_URL | grep -o '[0-9]*$')
echo "Issue created: ${ISSUE_URL}"
echo "Issue number: ${ISSUE_NUMBER}"
```

### 6.2 Add @remote-agent Comment
```bash
gh issue comment ${ISSUE_NUMBER} \
  --body "@remote-agent Please address this issue by adding a \"Validation\" section to the README.md file. Create a new branch for this change and open a pull request when done. Include details about our testing approach in the validation section."
```

### 6.3 Monitor Webhook Processing
```bash
# Wait for webhook processing (GitHub delivers webhooks within seconds)
echo "Waiting for webhook processing..."
sleep 10

# Check recent logs for webhook activity
docker-compose logs app --tail 100 | grep -E "GitHub|Webhook|issue" | tail -20
```

**Look for:**
- ✅ `[GitHub] Processing issue_comment: ${GITHUB_USERNAME}/${TEST_REPO_NAME}#${ISSUE_NUMBER}`
- ✅ `[GitHub] Using existing codebase` or `[GitHub] Cloning repository`
- ✅ `[GitHub] Syncing repository`
- ✅ `[Orchestrator] Starting AI conversation`
- ✅ `[Orchestrator] Streaming mode: batch` (GitHub uses batch mode)
- ✅ `[GitHub] Comment posted to ${GITHUB_USERNAME}/${TEST_REPO_NAME}#${ISSUE_NUMBER}`

### 6.4 Verify Issue Comment (Batch Mode)
```bash
gh issue view ${ISSUE_NUMBER} --comments
```

**Expected:**
- ✅ Single comment from bot account (batch mode, not streaming)
- ✅ Comment describes changes made or implementation plan
- ❌ NOT multiple small comments (would indicate streaming mode, which is wrong for GitHub)

---

## Phase 7: GitHub Pull Request Integration

Test @remote-agent mention in pull request comments.

**Note:** We'll use the PR created by the test adapter in Phase 4 (should be PR #1).

### 7.1 Verify Pull Request Exists
```bash
cd workspace/${TEST_REPO_NAME}

# Find the PR created by test adapter
PR_NUMBER=$(gh pr list --state open --limit 1 --json number -q '.[0].number')

if [ -z "$PR_NUMBER" ]; then
  echo "⚠️  No pull request found. Check logs for errors."
  docker-compose logs app | grep -E "ERROR|Error" | tail -20
  exit 1
else
  echo "✅ Pull request found: #${PR_NUMBER}"
  PR_URL=$(gh pr view ${PR_NUMBER} --json url -q .url)
  echo "PR URL: ${PR_URL}"
fi

# Return to project root
cd ../..
```

### 7.2 Request PR Review via @remote-agent
```bash
cd workspace/${TEST_REPO_NAME}

gh pr comment ${PR_NUMBER} \
  --body "@remote-agent Please review this pull request. Check for code quality, completeness, and adherence to best practices."

echo "Review request posted to PR #${PR_NUMBER}"
cd ../..
```

### 7.3 Monitor PR Review Processing
```bash
# Wait for webhook processing
echo "Waiting for webhook processing..."
sleep 60

# Check logs for PR webhook activity
docker-compose logs app --tail 100 | grep -E "GitHub.*pull_request|Orchestrator" | tail -20
```

**Look for:**
- ✅ `[GitHub] Processing issue_comment` (PR comments use same webhook event)
- ✅ `[Orchestrator] Starting AI conversation`
- ✅ `[Orchestrator] Streaming mode: batch`
- ✅ `[GitHub] Comment posted`

### 7.4 Verify PR Review Comment
```bash
cd workspace/${TEST_REPO_NAME}
gh pr view ${PR_NUMBER} --comments | tail -30
cd ../..
```

**Expected:**
- ✅ Bot comment with review feedback
- ✅ Single batch comment (not streaming)
- ✅ Review content mentions code quality or provides feedback

---

## Phase 8: Concurrency Validation (Optional Quick Test)

Verify concurrent conversation handling works correctly.

### 8.1 Send 3 Concurrent Requests
```bash
for i in {1..3}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"concurrent-${i}\",\"message\":\"/help\"}" &
done

# Wait for all background jobs to complete
wait

echo "All concurrent requests sent"
```

### 8.2 Check Concurrency Stats
```bash
sleep 2
curl http://localhost:3000/health/concurrency | jq
```

**Expected:**
- ✅ `active` shows 1-3 (depending on timing)
- ✅ `maxConcurrent: 10`
- ✅ `activeConversationIds` array populated

### 8.3 Verify Logs Show Concurrent Processing
```bash
docker-compose logs app | grep -E "ConversationLock.*concurrent" | tail -10
```

**Look for:** Multiple "Starting concurrent-X" entries

---

## Phase 9: Command Workflow Integration Test

Test the complete remote agentic workflow using slash commands: Prime → Plan → Execute → PR.

**This is the final comprehensive test validating the entire command-driven GitHub workflow.**

### 9.0 Copy Commands to Test Repository

The test repository needs the command files to invoke them via @remote-agent.

```bash
cd workspace/${TEST_REPO_NAME}

# Create .agents/commands directory
mkdir -p .agents/commands

# Copy command files from main project
cp ../../.agents/commands/prime.md .agents/commands/
cp ../../.agents/commands/plan-feature.md .agents/commands/
cp ../../.agents/commands/execute.md .agents/commands/

# Commit these commands to main branch
git add .agents/
git commit -m "Add remote coding agent commands"
git push origin main

echo "✅ Commands copied and pushed to test repository"

cd ../..
```

**Why needed:** The bot runs commands from the repository's working directory, so commands must exist in the test repo.

### 9.1 Create Test Issue for Command Workflow

```bash
cd workspace/${TEST_REPO_NAME}

# Create a new issue for command workflow test
COMMAND_ISSUE_URL=$(gh issue create \
  --title "Add Contributing section to README" \
  --body "Add a \"Contributing\" section to README.md that explains:
- How to clone the repository
- How to install dependencies
- How to run tests
- How to submit pull requests

Keep it simple and concise." \
  | grep -o 'https://.*')

COMMAND_ISSUE_NUMBER=$(echo $COMMAND_ISSUE_URL | grep -o '[0-9]*$')
echo "Command workflow test issue created: ${COMMAND_ISSUE_URL}"
echo "Issue number: ${COMMAND_ISSUE_NUMBER}"

cd ../..
```

### 9.2 Phase 1: Prime Command

Comment on the issue to load commands and prime the agent:

```bash
cd workspace/${TEST_REPO_NAME}

gh issue comment ${COMMAND_ISSUE_NUMBER} \
  --body "@remote-agent /load-commands .agents/commands

Once commands are loaded, run: /command-invoke prime"

echo "✅ Sent prime command request"
cd ../..
```

**Wait for processing:**
```bash
echo "Waiting for prime command to complete (60 seconds)..."
sleep 60

# Check logs
docker-compose logs app --tail 100 | grep -E "prime|Prime|command-invoke" | tail -20
```

**Verify prime completed:**
```bash
cd workspace/${TEST_REPO_NAME}
gh issue view ${COMMAND_ISSUE_NUMBER} --comments | tail -50
cd ../..
```

**Expected:** Bot comment with project overview, tech stack, architecture summary, and "Remote Development Readiness" checklist.

**Verify Database - Prime Conversation:**
```bash
# Check conversation created for prime/plan commands
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, platform_conversation_id, codebase_id, ai_assistant_type
FROM remote_agent_conversations
WHERE platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}'
ORDER BY created_at DESC
LIMIT 1;
\"
"

# Store conversation ID for later verification (will be same for prime, plan, and execute)
COMMAND_WORKFLOW_CONVERSATION_ID=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT id FROM remote_agent_conversations
WHERE platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}'
ORDER BY created_at DESC LIMIT 1;
\"" | tr -d ' ')

echo "Command Workflow Conversation ID: ${COMMAND_WORKFLOW_CONVERSATION_ID}"

# Check active sessions for this conversation
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, ai_assistant_type, active, started_at
FROM remote_agent_sessions
WHERE conversation_id = '${COMMAND_WORKFLOW_CONVERSATION_ID}'
ORDER BY started_at DESC
LIMIT 5;
\"
"
```

**Expected:**
- ✅ Conversation record created for issue conversation ID
- ✅ Codebase linked to conversation
- ✅ Active session(s) exist for prime and plan commands

### 9.3 Phase 2: Plan-Feature Command

Request feature planning:

```bash
cd workspace/${TEST_REPO_NAME}

gh issue comment ${COMMAND_ISSUE_NUMBER} \
  --body "@remote-agent /command-invoke plan-feature Add Contributing section to README with guidelines for cloning, installation, testing, and PR submission"

echo "✅ Sent plan-feature command request"
cd ../..
```

**Wait for planning:**
```bash
echo "Waiting for plan-feature to complete (120 seconds)..."
sleep 120

# Check logs
docker-compose logs app --tail 150 | grep -E "plan-feature|Plan|\.agents/plans" | tail -30
```

**Verify plan created:**
```bash
cd workspace/${TEST_REPO_NAME}

# Check if plan file was created
if [ -d ".agents/plans" ]; then
  echo "✅ .agents/plans directory exists"
  ls -la .agents/plans/

  # Store plan file name
  PLAN_FILE=$(ls .agents/plans/ | head -1)
  echo "Plan file created: ${PLAN_FILE}"
else
  echo "❌ .agents/plans directory not found"
fi

# Check issue comments for plan confirmation
gh issue view ${COMMAND_ISSUE_NUMBER} --comments | tail -100

cd ../..
```

**Expected:**
- ✅ `.agents/plans/<feature-name>.md` file created
- ✅ Bot comment with plan summary and confidence score
- ✅ Plan file contains comprehensive implementation details

### 9.4 Extract Branch Name and Plan File Path

```bash
cd workspace/${TEST_REPO_NAME}

# Extract branch name from bot's plan-feature response
# Bot should report: "Feature branch name: feature/add-contributing-section"
FEATURE_BRANCH=$(gh issue view ${COMMAND_ISSUE_NUMBER} --comments | grep -oP 'Feature branch name: \K[^\s]+' | tail -1)

if [ -z "$FEATURE_BRANCH" ]; then
  echo "⚠️  Could not extract feature branch name from bot response"
  echo "Trying to detect branch from git..."
  git fetch origin
  FEATURE_BRANCH=$(git branch -r | grep -v 'main\|master' | grep 'feature/' | head -1 | sed 's/.*origin\///')
fi

echo "Feature Branch: ${FEATURE_BRANCH}"

# Extract plan file path from bot's response
# Bot should report: "Plan file: .agents/plans/<filename>.md"
PLAN_FILE_PATH=$(gh issue view ${COMMAND_ISSUE_NUMBER} --comments | grep -oP 'Plan file: \K[^\s]+' | tail -1)

if [ -z "$PLAN_FILE_PATH" ]; then
  echo "⚠️  Could not extract plan file path from bot response"
  echo "Checking feature branch for plan file..."
  git fetch origin ${FEATURE_BRANCH}
  git checkout ${FEATURE_BRANCH}
  PLAN_FILE_PATH=$(ls .agents/plans/*.md | head -1)
  git checkout main
fi

echo "Plan File Path: ${PLAN_FILE_PATH}"

cd ../..
```

**Expected:**
- ✅ Feature branch name extracted (e.g., `feature/add-contributing-section`)
- ✅ Plan file path extracted (e.g., `.agents/plans/add-contributing-section.md`)
- ✅ Plan file committed to feature branch (not main)

### 9.5 Phase 3: Execute Command

Execute the implementation plan with both branch name and plan file path:

```bash
cd workspace/${TEST_REPO_NAME}

# Execute command now takes TWO arguments: branch name and plan file path
gh issue comment ${COMMAND_ISSUE_NUMBER} \
  --body "@remote-agent /command-invoke execute ${FEATURE_BRANCH} ${PLAN_FILE_PATH}"

echo "✅ Sent execute command: /command-invoke execute ${FEATURE_BRANCH} ${PLAN_FILE_PATH}"
cd ../..
```

**Wait for execution:**
```bash
echo "Waiting for execute command to complete (180 seconds)..."
echo "This includes: implementation, validation, commit, branch push, and PR creation"
sleep 180

# Monitor logs for execution progress
docker-compose logs app --tail 200 | grep -E "execute|Execute|pull request|PR created" | tail -40
```

### 9.6 Verify Execution Results

```bash
cd workspace/${TEST_REPO_NAME}

# Check for new pull request
COMMAND_PR_NUMBER=$(gh pr list --state open --json number,title --jq '.[] | select(.title | contains("Contributing")) | .number' | head -1)

if [ -n "$COMMAND_PR_NUMBER" ]; then
  echo "✅ Pull request created: #${COMMAND_PR_NUMBER}"
  COMMAND_PR_URL=$(gh pr view ${COMMAND_PR_NUMBER} --json url -q .url)
  echo "PR URL: ${COMMAND_PR_URL}"

  # Check PR details
  echo ""
  echo "=== PR Details ==="
  gh pr view ${COMMAND_PR_NUMBER}

  # Check PR diff
  echo ""
  echo "=== Files Changed ==="
  gh pr view ${COMMAND_PR_NUMBER} --json files --jq '.files[].path'

else
  echo "❌ No pull request found with 'Contributing' in title"
  echo "All open PRs:"
  gh pr list --state open
fi

# Check issue comments for execution summary
echo ""
echo "=== Final Issue Comments ==="
gh issue view ${COMMAND_ISSUE_NUMBER} --comments | tail -100

cd ../..
```

**Expected:**
- ✅ New feature branch created (e.g., `feature/add-contributing-section`)
- ✅ README.md modified with Contributing section
- ✅ All validation commands passed (type-check, lint, tests, build)
- ✅ Pull request created with comprehensive description
- ✅ Bot comment on issue with PR URL and completion summary

**CRITICAL: Verify Database - Session Separation for Execute:**
```bash
# Check ALL conversations for this repository issue
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, platform_conversation_id, codebase_id, created_at, updated_at
FROM remote_agent_conversations
WHERE platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}'
ORDER BY created_at DESC;
\"
"

echo ""
echo "Expected: Should see ONE conversation with TWO sessions"
echo "- Conversation: Tracks GitHub issue #${COMMAND_ISSUE_NUMBER}"
echo "- Session 1: Prime and plan commands (should be inactive)"
echo "- Session 2: Execute command (should be active)"
echo ""

# Count conversations for this issue
CONVERSATION_COUNT=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT COUNT(*) FROM remote_agent_conversations
WHERE platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}';
\"" | tr -d ' ')

echo "Total conversations for issue #${COMMAND_ISSUE_NUMBER}: ${CONVERSATION_COUNT}"

if [ "$CONVERSATION_COUNT" -eq 1 ]; then
  echo "✅ One conversation detected (correct - sessions provide separation)"
else
  echo "⚠️  Found ${CONVERSATION_COUNT} conversation(s). Expected 1 for GitHub issue."
fi

# Get the conversation ID (should be only one)
CONVERSATION_ID=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT id FROM remote_agent_conversations
WHERE platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}'
ORDER BY created_at DESC LIMIT 1;
\"" | tr -d ' ')

echo ""
echo "Conversation ID: ${CONVERSATION_ID}"

# Verify session separation
echo ""
echo "=== Verify Session Separation ==="
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT
  s.id as session_id,
  s.active,
  s.started_at,
  s.ended_at,
  CASE
    WHEN s.ended_at IS NULL THEN 'Active (Execute)'
    ELSE 'Inactive (Prime/Plan)'
  END as phase
FROM remote_agent_sessions s
JOIN remote_agent_conversations c ON s.conversation_id = c.id
WHERE c.platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}'
ORDER BY s.started_at ASC;
\"
"

# Count sessions
SESSION_COUNT=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT COUNT(*) FROM remote_agent_sessions s
JOIN remote_agent_conversations c ON s.conversation_id = c.id
WHERE c.platform_conversation_id = '${GITHUB_USERNAME}/${TEST_REPO_NAME}#${COMMAND_ISSUE_NUMBER}';
\"" | tr -d ' ')

echo ""
echo "Total sessions for issue #${COMMAND_ISSUE_NUMBER}: ${SESSION_COUNT}"

if [ "$SESSION_COUNT" -ge 2 ]; then
  echo "✅ Multiple sessions detected (correct - plan→execute transition creates new session)"
else
  echo "❌ Only ${SESSION_COUNT} session(s) found. Expected at least 2."
fi

# Check all sessions for this conversation
echo ""
echo "=== All Sessions for This Conversation ==="
docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -c \"
SELECT id, ai_assistant_type, active, started_at, ended_at
FROM remote_agent_sessions
WHERE conversation_id = '${CONVERSATION_ID}'
ORDER BY started_at ASC;
\"
"

# Check if first session (prime/plan) is inactive
FIRST_SESSION_INACTIVE=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT COUNT(*) FROM remote_agent_sessions
WHERE conversation_id = '${CONVERSATION_ID}'
  AND ended_at IS NOT NULL
ORDER BY started_at ASC
LIMIT 1;
\"" | tr -d ' ')

echo ""
if [ "$FIRST_SESSION_INACTIVE" -eq 1 ]; then
  echo "✅ First session (Prime/Plan) marked as inactive (correct)"
else
  echo "⚠️  First session may still be active (unexpected)"
fi

# Check if latest session exists and may be active
LATEST_SESSION_EXISTS=$(docker exec remote-coding-agent-app-1 sh -c "
psql '$DATABASE_URL' -t -c \"
SELECT COUNT(*) FROM remote_agent_sessions
WHERE conversation_id = '${CONVERSATION_ID}'
ORDER BY started_at DESC
LIMIT 1;
\"" | tr -d ' ')

if [ "$LATEST_SESSION_EXISTS" -eq 1 ]; then
  echo "✅ Latest session (Execute) exists"
else
  echo "⚠️  No latest session found"
fi
```

**Database Validation - Expected Results:**
- ✅ **ONE conversation exists** for issue #${COMMAND_ISSUE_NUMBER}
  - Conversation tracks the GitHub issue thread
  - Multiple sessions within this conversation
- ✅ **TWO OR MORE sessions** within the conversation
  - First session: Prime and plan commands (inactive)
  - Second session: Execute command (may be active or ended)
- ✅ **Prime/Plan session inactive** (ended_at timestamp set)
- ✅ **Execute session created** with fresh AI context
- ✅ **Conversation links to codebase**

**Why this matters:**
- Execute command creates a **NEW SESSION** (not new conversation)
- Sessions provide **AI context separation** - execute has no memory of prime/plan
- Conversations track **platform threads** (GitHub issues, Telegram chats)
- This design matches GitHub's UX: one issue thread, multiple AI interaction phases
- Proper session lifecycle management (old sessions end, new sessions start)

### 9.7 Validate PR Quality

```bash
cd workspace/${TEST_REPO_NAME}

if [ -n "$COMMAND_PR_NUMBER" ]; then
  echo "=== PR Validation ==="

  # Check PR body content
  PR_BODY=$(gh pr view ${COMMAND_PR_NUMBER} --json body -q .body)

  # Verify PR has required sections
  if echo "$PR_BODY" | grep -q "## Summary"; then
    echo "✅ PR has Summary section"
  fi

  if echo "$PR_BODY" | grep -q "## Changes"; then
    echo "✅ PR has Changes section"
  fi

  if echo "$PR_BODY" | grep -q "## Validation"; then
    echo "✅ PR has Validation section"
  fi

  if echo "$PR_BODY" | grep -q "Generated with Remote Coding Agent"; then
    echo "✅ PR has Remote Coding Agent attribution"
  fi

  # Check if PR links to plan file
  if echo "$PR_BODY" | grep -q ".agents/plans"; then
    echo "✅ PR links to plan file"
  fi

  # Verify branch exists
  BRANCH_NAME=$(gh pr view ${COMMAND_PR_NUMBER} --json headRefName -q .headRefName)
  echo ""
  echo "Feature branch: ${BRANCH_NAME}"

  # Check commit message
  echo ""
  echo "=== Latest Commit ==="
  git fetch origin ${BRANCH_NAME}
  git log origin/${BRANCH_NAME} --oneline -1
  git log origin/${BRANCH_NAME} -1 --pretty=format:"%B"

fi

cd ../..
```

**Expected:**
- ✅ PR body follows template (Summary, Changes, Validation sections)
- ✅ PR links to plan file
- ✅ Conventional commit message (e.g., "docs: Add Contributing section")
- ✅ Commit includes Remote Coding Agent attribution

### 9.8 Command Workflow Test Results

```bash
echo ""
echo "========================================"
echo "COMMAND WORKFLOW TEST RESULTS"
echo "========================================"
echo ""
echo "Issue: #${COMMAND_ISSUE_NUMBER} - ${COMMAND_ISSUE_URL}"
echo ""
echo "Commands Executed:"
echo "  1. /load-commands .agents/commands"
echo "  2. /command-invoke prime"
echo "  3. /command-invoke plan-feature <feature description>"
echo "  4. /command-invoke execute .agents/plans/<plan-file>"
echo ""
echo "Outputs:"
echo "  - Plan File: .agents/plans/${PLAN_FILE}"
echo "  - Pull Request: #${COMMAND_PR_NUMBER} - ${COMMAND_PR_URL}"
echo "  - Feature Branch: ${BRANCH_NAME}"
echo ""
echo "========================================"
```

**Success Criteria:**
- ✅ Prime command completed with project overview
- ✅ Plan-feature command created comprehensive plan file
- ✅ Execute command implemented feature from plan
- ✅ All validations passed during execution
- ✅ Pull request created with proper structure
- ✅ PR links to plan file
- ✅ Feature branch follows naming convention
- ✅ Conventional commit message used

---

## Phase 10: Final Summary

Generate comprehensive validation report.

### 10.1 Collect Validation Results

**Foundation Validation:**
- ✅/❌ Type checking passed
- ✅/❌ Linting passed
- ✅/❌ Unit tests passed
- ✅/❌ Build succeeded

**Docker Validation:**
- ✅/❌ Container started without errors
- ✅/❌ Health endpoints responding
- ✅/❌ Lock manager initialized

**Test Adapter Validation:**
- ✅/❌ Clone command successful
- ✅/❌ Implementation request processed
- ✅/❌ PR created via test adapter
- ✅/❌ Logs show proper tool usage

**Database Validation:**
- ✅/❌ Codebase record created
- ✅/❌ Conversation record created
- ✅/❌ Session records present and active

**GitHub Integration:**
- ✅/❌ Issue webhook processed
- ✅/❌ @remote-agent comment responded (batch mode)
- ✅/❌ Pull request created by bot
- ✅/❌ PR review comment processed

**Concurrency Validation:**
- ✅/❌ Multiple conversations processed simultaneously
- ✅/❌ Stats endpoint accurate

**Command Workflow:**
- ✅/❌ Commands loaded successfully
- ✅/❌ Prime command completed
- ✅/❌ Plan-feature command created plan file
- ✅/❌ Execute command implemented feature and created PR

**Command Workflow Database:**
- ✅/❌ Prime/Plan conversation created
- ✅/❌ Execute session separation (NEW session with fresh AI context)
- ✅/❌ Prime/Plan sessions marked inactive after completion
- ✅/❌ Execute sessions created successfully
- ✅/❌ Total: 1 conversation for command workflow issue (expected)
- ✅/❌ Total: 2+ sessions for plan→execute transition (expected)

### 10.2 Repository Information
```bash
echo "====================================="
echo "VALIDATION COMPLETE"
echo "====================================="
echo ""
echo "Test Repository: ${TEST_REPO_URL}"
echo "Issue #${ISSUE_NUMBER}: ${ISSUE_URL}"
echo "Pull Request #${PR_NUMBER}: ${PR_URL}"
echo ""
echo "Repository Name: ${TEST_REPO_NAME}"
echo ""
echo "Command Test Issue: #${COMMAND_ISSUE_NUMBER}"
echo "Command Test PR: #${COMMAND_PR_NUMBER}"
echo ""
```

### 10.3 Issue Detection
```bash
# Check for errors in logs
ERROR_COUNT=$(docker-compose logs app | grep -c -E "ERROR|Error:")
echo "Error count in logs: ${ERROR_COUNT}"

if [ $ERROR_COUNT -gt 0 ]; then
  echo ""
  echo "⚠️  ERRORS DETECTED - Sample:"
  docker-compose logs app | grep -E "ERROR|Error:" | tail -5
fi
```

### 10.4 Summary Report Format

Provide a formatted summary to the user:

```
=======================================
VALIDATION SUMMARY
=======================================

FOUNDATION:
  Type Checking: ✅/❌
  Linting: ✅/❌
  Unit Tests: ✅/❌
  Build: ✅/❌

DOCKER:
  Container Startup: ✅/❌
  Health Checks: ✅/❌
  Lock Manager: ✅/❌

TEST ADAPTER:
  Clone Command: ✅/❌
  Implementation: ✅/❌
  Tool Usage: ✅/❌

DATABASE:
  Codebase Record: ✅/❌
  Conversation Record: ✅/❌
  Session Records: ✅/❌

GITHUB INTEGRATION:
  Issue Webhook: ✅/❌
  Issue Response (batch): ✅/❌
  PR Creation: ✅/❌
  PR Review: ✅/❌

CONCURRENCY:
  Concurrent Processing: ✅/❌
  Stats Accuracy: ✅/❌

COMMAND WORKFLOW:
  Commands Loaded: ✅/❌
  Prime Command: ✅/❌
  Plan-Feature Command: ✅/❌
  Execute Command: ✅/❌
  PR Created: ✅/❌

COMMAND WORKFLOW DATABASE:
  Prime/Plan Conversation: ✅/❌
  Execute New Conversation: ✅/❌
  Prime/Plan Sessions Inactive: ✅/❌
  Execute Sessions Created: ✅/❌
  Total Conversations: 2 (expected)

LINKS:
  Repository: ${TEST_REPO_URL}
  Issue #${ISSUE_NUMBER}: ${ISSUE_URL}
  Pull Request #${PR_NUMBER}: ${PR_URL}
  Command Test Issue #${COMMAND_ISSUE_NUMBER}: (issue URL)
  Command Test PR #${COMMAND_PR_NUMBER}: (PR URL)

ERRORS: ${ERROR_COUNT} found in logs

OVERALL: ✅ PASS / ❌ FAIL
=======================================
```

---

## Phase 11: Cleanup Information

**Test repository is preserved for manual inspection.**

Repository: ${TEST_REPO_URL}
Issue #${ISSUE_NUMBER}: ${ISSUE_URL}
Pull Request #${PR_NUMBER}: ${PR_URL}
Command Test Issue #${COMMAND_ISSUE_NUMBER}: (issue URL)
Command Test PR #${COMMAND_PR_NUMBER}: (PR URL)

You can delete the test repository when ready:
```bash
gh repo delete ${GITHUB_USERNAME}/${TEST_REPO_NAME} --yes
rm -rf workspace/${TEST_REPO_NAME}
```

---

## Important Notes

### Prerequisites
- **Ngrok URL**: Pass as argument when running command (e.g., `/validation:validate https://your-url.ngrok-free.dev`)
- **Ngrok Running**: Must be running and forwarding to port 3000 before starting validation
- **Environment**: Ensure `.env` has all required credentials (DATABASE_URL, WEBHOOK_SECRET, GitHub tokens, Claude token)
- **GitHub CLI**: Must be authenticated (`gh auth status`)

### Execution Details
- **Timing**: AI operations may take 30-90 seconds, adjust sleep times if needed
- **Batch Mode**: GitHub responses should be single comments, not streaming (verified in Phase 6-7)
- **Database**: Queries run via `docker exec` (psql not required on host)
- **Database Validation**: Critical throughout - verifies conversations, sessions, and state transitions
- **Workspace**: Cleaned automatically at start to avoid conflicts with Docker volume mount
- **Webhook**: Automatically configured with secret from `.env`

### Database Validation Checkpoints
The validation extensively tests database state throughout:
- **Phase 5**: Test adapter conversation and sessions
- **Phase 9.2**: Prime command creates conversation with active sessions
- **Phase 9.6**: Execute creates NEW SESSION for fresh AI context (reuses same conversation)
- **Phase 9.6**: Prime/plan sessions become inactive after execute starts
- **Phase 9.6**: Verifies 1 conversation with 2+ sessions for command workflow issue

**Critical Behavior Verified:**
- ✅ Execute command creates new SESSION (fresh AI context, no memory of planning)
- ✅ Old sessions properly deactivated (clean state management)
- ✅ Conversation-to-codebase linking works correctly
- ✅ Session lifecycle management (create → active → inactive)

**Design Note: Conversations vs Sessions**
- **Conversations** = Platform threads (1 per GitHub issue, 1 per Telegram chat)
- **Sessions** = AI interaction phases (multiple per conversation)
- For plan→execute: NEW session provides AI separation, same conversation tracks platform context

### After Validation
- **Cleanup**: Repository is NOT auto-deleted for safety (manual confirmation required)
- **Manual Delete**: Use provided commands in Phase 10 when ready

**If any critical step fails, STOP and report the issue immediately with logs.**

### Common Issues

**Problem**: "Directory already exists" during clone
**Solution**: Workspace cleanup in Phase 2.0 handles this automatically

**Problem**: Test adapter using wrong AI assistant (e.g., using Claude when DEFAULT_AI_ASSISTANT=codex)
**Solution**: Database cleanup in Phase 2.0 handles this automatically. Old test conversations persist across runs and retain their original ai_assistant_type. The cleanup step deletes test-% conversations so they recreate with current environment settings.

**Problem**: Webhook not triggering
**Solution**: Verify ngrok URL is correct and matches what you passed as argument

**Problem**: psql command not found
**Solution**: Using `docker exec` (Phase 5) works even without psql on host

**Problem**: Execute command reuses same conversation instead of creating new one
**Solution**: Check GitHub adapter code - execute should trigger new conversation creation

**Problem**: Prime/plan sessions still active after execute starts
**Solution**: Sessions should be marked inactive when conversation ends - check session management

**Problem**: Database shows only 1 conversation for command workflow
**Solution**: Execute command should create new conversation - verify conversation creation logic in orchestrator
