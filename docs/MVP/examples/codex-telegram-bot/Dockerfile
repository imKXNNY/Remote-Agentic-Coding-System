# Codex Telegram Bot - Dockerfile

FROM node:20-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Codex CLI globally
RUN npm install -g @openai/codex

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy TypeScript source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove devDependencies after build to reduce image size (optional)
RUN npm prune --production

# Copy configuration templates
COPY codex_config ./codex_config

# Copy scripts
COPY scripts ./scripts

# Create Codex home directory
RUN mkdir -p /root/.codex

# Create workspace and sessions directories
RUN mkdir -p /workspace /app/telegram_sessions

# Copy AGENTS.md to workspace so Codex can find it
# This provides global rules for all Codex operations
RUN cp /app/codex_config/AGENTS.md /workspace/AGENTS.md

# Expose no ports (bot connects to Telegram)

# Environment variables will be provided at runtime:
# - TELEGRAM_BOT_TOKEN
# - CODEX_ID_TOKEN, CODEX_ACCESS_TOKEN, CODEX_REFRESH_TOKEN, CODEX_ACCOUNT_ID
# - BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID
# - OPENAI_API_KEY
# - GH_TOKEN (GitHub CLI authentication)

# Startup: Generate auth.json and config.toml, then start bot
CMD ["sh", "-c", "npm run setup-auth && npm run setup-config && npm start"]
