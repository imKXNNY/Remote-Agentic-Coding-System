# Remote Claude Code via Telegram

**Access Claude Code from anywhere - your phone, desktop, or any device with Telegram.**

This workshop demonstrates how to deploy Claude Code to the cloud and interact with it remotely through Telegram. Perfect for working on your projects from any device, anywhere. I will be extending this in the future to support other AI coding assistants as well once they release SDKs (and they will!).

## 🎯 Why Remote Claude Code?

- **Access from anywhere**: Chat with Claude Code from your phone, tablet, or any device
- **Cloud deployment**: Deploy to any server and work on remote directories
- **Persistent sessions**: Your conversations and context are maintained across messages
- **Full tool access**: Claude can read, write, edit files, and execute commands on your remote machine
- **Secure & private**: All sessions stored locally, no cloud databases

## 📋 Prerequisites

- Docker and Docker Compose installed ([Get Docker](https://docs.docker.com/get-docker/))
- Claude Code CLI installed locally ([Install guide](https://docs.claude.com/en/docs/claude-code/setup))
- A Telegram account
- **Claude authentication** (choose one):
  - A Claude Pro/Max subscription (recommended) - use `claude setup-token`
  - OR an Anthropic API key - get from [console.anthropic.com](https://console.anthropic.com/)
- A GitHub Personal Access Token ([Create one here](https://github.com/settings/tokens))

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/dynamous-community/workshops.git
cd workshops/remote-claude-code-telegram
```

### 2. Get Your Tokens

**Claude Code Authentication (choose ONE):**

**Option A: Claude Subscription Token (RECOMMENDED)**
1. Ensure Claude Code CLI is installed: `npm install -g @anthropic-ai/claude-code`
2. Run: `claude setup-token`
3. Complete the browser authentication flow
4. Copy the token (starts with `sk-ant-oat01-...`)
5. **Benefits**: Uses your Claude Pro/Max subscription, no API charges

**Option B: Anthropic API Key (Alternative)**
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an API key
3. Copy the key
4. **Note**: This incurs API usage charges

**GitHub Personal Access Token:**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`
4. Generate and copy the token

**Telegram Bot Token:**
1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow instructions
3. Copy the bot token you receive

### 3. Configure Environment

```bash
cp .env.example .env
nano .env  # or use any text editor
```

Add your tokens to `.env`:
```bash
# Claude authentication - use ONE of these:
CLAUDE_CODE_OAUTH_TOKEN=your_claude_oauth_token_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here

GH_TOKEN=your_github_token_here
TELEGRAM_BOT_API_KEY=your_telegram_bot_token_here

# Optional: Customize workspace location on your host machine
# WORKSPACE_PATH=/path/to/your/projects
```

> **Tip:** If using Option B (API Key), comment out `CLAUDE_CODE_OAUTH_TOKEN` and uncomment `ANTHROPIC_API_KEY`.

### 4. Start the Bot

```bash
docker-compose up -d
```

That's it! The container includes Claude Code CLI and GitHub CLI pre-installed with automatic authentication.

**View logs:**
```bash
docker-compose logs -f
```

**Stop the bot:**
```bash
docker-compose down
```

### 5. Start Chatting!

1. Find your bot on Telegram (search for the username you created)
2. Send `/start` to begin
3. Set your working directory: `/setcwd /workspace`
4. Start asking Claude to help with your code!

> **Note:** Files created/modified in `/workspace` are stored on your host machine at `./workspace` (or your custom `WORKSPACE_PATH`). Claude Code has full access to read, write, and execute commands in this directory.

## ☁️ Cloud Deployment

The exact same Docker setup works on any cloud provider! Just follow these steps:

### Deploy to VPS (DigitalOcean, Linode, AWS EC2, etc.)

**1. Install Docker on your server:**
```bash
# SSH into your server
ssh user@your-server.com

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin

# Add your user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
```

**2. Get your Claude token (on your local machine):**

If using Claude subscription (recommended):
```bash
# Install Claude Code CLI locally
npm install -g @anthropic-ai/claude-code

# Generate OAuth token
claude setup-token
# Copy the token that starts with "sk-ant-oat01-..."
```

**3. Clone and configure:**
```bash
git clone https://github.com/dynamous-community/workshops.git
cd workshops/remote-claude-code-telegram

cp .env.example .env
nano .env  # Add your CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY), GH_TOKEN, TELEGRAM_BOT_API_KEY
```

**4. Start the bot:**
```bash
docker-compose up -d
```

**5. Verify it's running:**
```bash
docker-compose logs -f
```

That's it! The bot will automatically restart if it crashes or if the server reboots.

### Managing the Deployment

**View logs:**
```bash
docker-compose logs -f
```

**Restart the bot:**
```bash
docker-compose restart
```

**Update to latest code:**
```bash
git pull
docker-compose down
docker-compose up -d --build
```

**Stop the bot:**
```bash
docker-compose down
```

## 📂 Understanding the Workspace

The Docker container mounts a **workspace directory** that bridges the container and your host machine:

```
Your Host Machine              Docker Container
./workspace/        <---->     /workspace/
```

**Why this matters:**
- When Claude Code creates/edits files in `/workspace` (inside container), they appear in `./workspace/` on your machine
- Git repos cloned by Claude persist on your host
- You can edit files on your host, and Claude sees the changes immediately

**Customizing the workspace location:**

Want Claude to work in your existing projects directory? Update `.env`:

```bash
WORKSPACE_PATH=/home/user/my-projects
```

Now `/workspace` in the container maps to `/home/user/my-projects` on your host!

**Important:** Always use `/setcwd /workspace` in Telegram to work within this mounted directory.

## 💬 Usage

### Available Commands

- `/start` - Welcome message and introduction
- `/help` - Show available commands and usage tips
- `/setcwd <path>` - Set your working directory for file operations
- `/getcwd` - Show your current working directory
- `/searchcwd <query>` - Search for directories matching a pattern
- `/reset` - Clear conversation history (keeps working directory)

### Example Conversations

**Setting up your workspace:**
```
You: /setcwd /workspace
Bot: ✅ Working directory set to:
     /workspace
```

**Working with files:**
```
You: List all Python files in the current directory
Bot: Let me check that for you.
     🔧 BASH
     ls *.py

     The current directory contains 12 Python files:
     - main.py
     - utils.py
     - config.py
     ...

You: Read main.py and explain what it does
Bot: 🔧 READ
     Reading: main.py

     This is the main entry point for your application...
```

**Making changes:**
```
You: Add a new function to utils.py that formats dates
Bot: 🔧 READ
     Reading: utils.py

     🔧 EDIT
     Editing: utils.py

     I've added a `format_date()` function to utils.py that...
```

**Running commands:**
```
You: Run the tests for this project
Bot: 🔧 BASH
     pytest tests/

     ===== test session starts =====
     collected 24 items

     tests/test_main.py ✓✓✓✓
     ...
```

## 🏗️ Architecture

**Docker Container Includes:**
- Python 3.11 runtime
- Claude Code CLI (pre-installed and authenticated via `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`)
- GitHub CLI (pre-installed and authenticated via `GH_TOKEN`)
- Telegram bot script (`telegram_bot.py`)

**Bot Components:**

**1. Session Management** (`telegram_sessions/`)
- Each Telegram user gets their own isolated session
- Sessions persist across bot restarts (mounted volume)
- Stores Claude session ID and user's working directory preference

**2. Claude Agent Integration**
- Uses the Claude Agent SDK for Python
- Supports all Claude Code tools: Read, Write, Bash, Edit, MCP tools
- Streams responses in real-time for immediate feedback
- Tool usage is displayed interleaved with messages

**3. Message Handling**
- Asynchronous message processing with python-telegram-bot
- Automatic message splitting for long responses (>4096 chars)
- Real-time "typing" indicators for better UX

**4. Workspace Volume Mount**
- `/workspace` in container maps to `./workspace` on host (or custom `WORKSPACE_PATH`)
- All file operations by Claude Code persist on your host machine
- Git repos cloned in container are accessible on your host

**Optional: Sentry Monitoring**
- Add `SENTRY_DSN` to enable error tracking and performance monitoring

## 📁 Project Structure

```
remote-claude-code-telegram/
├── telegram_bot.py              # Telegram bot with optional Sentry monitoring
├── Dockerfile                   # Container image definition
├── docker-compose.yml           # Docker orchestration
├── requirements.txt             # Python dependencies
├── .env.example                # Environment variables template
├── .env                        # Your configuration (git-ignored)
├── tests/                       # Test files
│   ├── test_telegram_bot.py
│   └── test_sentry_monitoring.py
├── telegram_sessions/           # User session storage (volume mount)
│   └── .gitkeep
├── workspace/                   # Your projects directory (volume mount)
├── .claude/                     # Claude Code configuration
│   ├── agents/
│   └── commands/
├── PRPs/                        # Project Requirements & Planning
├── .gitignore
├── CLAUDE.md                   # Claude instructions
└── README.md                   # This file
```

## 🔐 Security Notes

- **Tokens & Keys**: Never commit your `.env` file. Keep `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`), `GH_TOKEN`, and `TELEGRAM_BOT_API_KEY` secret
- **Access Control**: The bot works in direct messages (DMs) only - no group chat access
- **Working Directory**: Users can only access directories they explicitly configure
- **Workspace Volume**: Only mount directories you trust. Claude Code has full read/write/execute access
- **Session Data**: All session data is stored locally on your machine, not in cloud databases
- **Cloud Deployment**: Ensure proper firewall configuration and use strong SSH keys
- **GitHub Token Scopes**: Only grant necessary permissions (typically `repo` and `workflow`)
