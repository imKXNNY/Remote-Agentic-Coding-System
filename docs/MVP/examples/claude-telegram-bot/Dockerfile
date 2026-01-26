# Base image with Python
FROM python:3.11-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18.x (required for Claude Code CLI)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY telegram_bot.py .
COPY telegram_sessions/ ./telegram_sessions/
COPY .claude/ ./.claude/
COPY PRPs/ ./PRPs/

# Create directory for session storage
RUN mkdir -p /app/telegram_sessions

# Environment variables for authentication (will be overridden by docker-compose or CLI)
# Claude Code authentication (use ONE):
#   - CLAUDE_CODE_OAUTH_TOKEN (recommended) - Uses Claude Pro/Max subscription
#   - ANTHROPIC_API_KEY (alternative) - Uses Console API key
# GH_TOKEN - Used by GitHub CLI for authentication
# TELEGRAM_BOT_API_KEY - Required for Telegram bot
# SENTRY_DSN - Optional for error monitoring

# Run the bot
CMD ["python", "-u", "telegram_bot.py"]
