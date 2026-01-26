# Codex Telegram Bot (TypeScript)

Remote access to OpenAI Codex SDK via Telegram with browser automation and session replay verification.

## Overview

This Telegram bot provides a conversational interface to OpenAI Codex, allowing you to code from anywhere on any device. It features:

- **Remote Coding**: Access Codex from your phone or any Telegram client
- **Per-User Sessions**: Isolated conversation threads for each user
- **Working Directory Management**: Switch between projects seamlessly
- **Browser Automation**: Automatic frontend verification via Stagehand MCP
- **Session Replay URLs**: Watch video replays of Codex testing your changes
- **Real-Time Streaming**: See Codex responses as they're generated
- **Docker Ready**: Easy deployment with docker-compose

## Features

✅ **Full Codex SDK Integration**
- Thread-per-working-directory strategy
- Streaming responses with real-time updates
- Persistent sessions across restarts
- Full write permissions with auto-approval (configurable)

✅ **Stagehand MCP Support (Optional)**
- Browser navigation and interaction
- Automated frontend testing and verification
- Session replay URLs for watching Codex validate changes
- Works fine without it - just no automated verification

✅ **Smart Session Management**
- JSON-based user sessions
- Automatic thread creation on directory change
- Session persistence

✅ **Telegram Commands**
- `/start` - Welcome and quick start
- `/help` - Command reference
- `/setcwd` - Set working directory
- `/getcwd` - Show current directory
- `/searchcwd` - Find directories
- `/reset` - Clear conversation (preserves directory)

✅ **Full Permissions (Default)**
- `workspace-write` mode - Codex can create/edit files in working directory
- `never` approval - No interruptions, fully automated
- Workspace isolation - System files protected

## Prerequisites

- **Docker & Docker Compose** (required)
- **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- **Codex Authentication** (from `codex login`)
- **GitHub Personal Access Token** (for repository operations)
- **Browserbase Account** (optional, for automated frontend verification)

## Quick Start

### 1. Create Telegram Bot

```bash
# In Telegram, message @BotFather
/newbot
# Follow prompts to get your bot token
```

### 2. Get Codex Credentials

```bash
# Authenticate with Codex
codex login

# View your auth.json
# Linux/Mac: ~/.codex/auth.json
# Windows: %USERPROFILE%\.codex\auth.json
```

Copy these values:
- `tokens.id_token`
- `tokens.access_token`
- `tokens.refresh_token`
- `tokens.account_id`

### 3. Get Browserbase Credentials (Optional - For Frontend Verification)

**You can skip this step!** The bot works perfectly fine without Browserbase. You'll just miss out on automated frontend verification with session replay URLs.

If you want Codex to automatically verify frontend changes:
1. Visit [browserbase.com](https://browserbase.com)
2. Sign up for free account
3. Create a project
4. Copy API key and Project ID
5. Add them to your `.env` file

If skipping: Just leave those variables commented out in `.env`

### 4. Configure Environment

```bash
cd codex-telegram-bot
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `CODEX_ID_TOKEN` - From ~/.codex/auth.json
- `CODEX_ACCESS_TOKEN` - From ~/.codex/auth.json
- `CODEX_REFRESH_TOKEN` - From ~/.codex/auth.json
- `CODEX_ACCOUNT_ID` - From ~/.codex/auth.json
- `GH_TOKEN` - GitHub Personal Access Token (repo + workflow scopes)

Optional variables (for Stagehand):
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`
- `OPENAI_API_KEY`

### 5. Start with Docker

```bash
# Build and start
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Docker Deployment Details

### Environment Variables

Create `.env` file with:

```env
# Required - Core Bot
TELEGRAM_BOT_TOKEN=your_bot_token
CODEX_ID_TOKEN=your_id_token
CODEX_ACCESS_TOKEN=your_access_token
CODEX_REFRESH_TOKEN=your_refresh_token
CODEX_ACCOUNT_ID=your_account_id

# Required - GitHub Operations
GH_TOKEN=your_github_token

# Optional - Stagehand MCP (Frontend Verification)
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
OPENAI_API_KEY=your_openai_key
```

### Verify Deployment

```bash
# Check logs
docker-compose logs -f codex-telegram-bot

# Should see:
# ✅ Environment configuration validated
# ✅ Successfully created auth.json
# ✅ Successfully created config.toml
# ✅ Codex Telegram Bot is running!
```

### Volumes

- `./workspace:/workspace` - Your code projects
- `./telegram_sessions:/app/telegram_sessions` - User sessions
- `codex_sessions:/root/.codex/sessions` - Codex thread data

## Usage Examples

### Basic Coding

```
You: Create a Python function to calculate fibonacci numbers

Bot: [Creates fibonacci.py with implementation]
```

### Frontend Development with Verification

```
You: Add a dark mode toggle to the header

Bot:
✅ Changes implemented and deployed to staging!

You: Verify the changes on staging

Bot:
✅ Staging verification complete!

**Changes verified:**
- Navigated to staging environment
- Clicked dark mode toggle to test functionality
- Scrolled through page to show dark mode applied
- Everything works as expected!

**Watch the verification replay:**
https://www.browserbase.com/orgs/.../sessions/abc123

This session shows a video replay of me testing the dark mode toggle.
```

### Working Directory

```
You: /setcwd /workspace/my-react-app
Bot: ✅ Working directory set to: /workspace/my-react-app

You: Add a login form component
Bot: [Creates component in correct directory]
```

## MCP Server Configuration

The bot uses two MCP servers:

### Sequential Thinking
Enables step-by-step reasoning for complex tasks.

### Stagehand (Browserbase)
Provides browser automation for frontend verification:
- Navigate to staging/production URLs
- Click elements and interact with features
- Scroll to show changes
- Demonstrate functionality

Creates session replays that show Codex testing your changes.

Configuration in `codex_config/config.toml.template`:

```toml
[mcp_servers.stagehand]
command = "npx"
args = ["-y", "@browserbasehq/mcp-server-browserbase"]
startup_timeout_ms = 30_000

[mcp_servers.stagehand.env]
BROWSERBASE_API_KEY = "${BROWSERBASE_API_KEY}"
BROWSERBASE_PROJECT_ID = "${BROWSERBASE_PROJECT_ID}"
OPENAI_API_KEY = "${OPENAI_API_KEY}"
```

## Frontend Verification Workflow

When you ask Codex to verify frontend changes:

1. **Deploy to Staging**: Bot creates PR, merges, triggers deployment
2. **Wait for Deployment**: 2-3 minutes for Render to build
3. **Verify Request**: You ask "Verify the changes on staging"
4. **Navigate & Test**: Bot uses Stagehand to:
   - Navigate to staging URL
   - Scroll to show the changes
   - Click new buttons to test functionality
   - Interact with new features
5. **Send Session URL**: Bot provides Browserbase session replay link
6. **Watch Replay**: You watch video of Codex testing your changes

Session URLs show video replays, not static screenshots.

## Architecture

### Session Management

Each user gets isolated sessions stored as JSON files:

```json
{
  "user_id": 12345,
  "cwd": "/workspace/project",
  "thread_id": "thread_xyz",
  "created_at": "2025-10-19T...",
  "last_updated": "2025-10-19T..."
}
```

### Thread-per-CWD Strategy

When you change working directory with `/setcwd`:
1. Current `thread_id` is cleared
2. New thread created with new working directory
3. Fresh conversation context
4. Previous threads preserved but not active

### Event Flow

```
User Message → Telegram
    ↓
Load/Create Session
    ↓
Resume/Create Thread (with workingDirectory)
    ↓
Stream Codex Response
    ↓
Process Events (text, tools, thinking, MCP calls)
    ↓
Send to Telegram
    ↓
On Turn Complete:
  → Save Session
  → Session replays accessible via Browserbase URLs
```

## Project Structure

```
codex-telegram-bot/
├── src/
│   ├── bot/
│   │   ├── commands/          # Telegram commands
│   │   ├── handlers/          # Message handler
│   │   └── utils/             # Utilities (screenshot, formatting)
│   ├── codex/                 # Codex SDK wrapper
│   ├── session/               # Session management
│   ├── config/                # Environment config
│   └── index.ts               # Entry point
├── scripts/                   # Setup scripts
├── codex_config/              # MCP config templates
├── telegram_sessions/         # User sessions (gitignored)
├── workspace/                 # Your projects (gitignored)
├── Dockerfile
├── docker-compose.yml
└── README.md
```
