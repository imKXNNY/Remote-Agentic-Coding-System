FROM node:20-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    bash \
    ca-certificates \
    gnupg \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Codex + Claude Code CLIs
RUN npm install -g @openai/codex @anthropic-ai/claude-code

# Create non-root user for running Claude Code
# Claude Code refuses to run with --dangerously-skip-permissions as root for security
RUN useradd -m -u 1001 -s /bin/bash appuser \
    && mkdir -p /workspace \
    && chown -R appuser:appuser /app /workspace

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build WebUI
# Sync shared types first
RUN npm run sync:types
# Build Svelte frontend
WORKDIR /app/webui
RUN npm install
RUN npm run build
# Cleanup frontend node_modules (static assets are in dist)
RUN rm -rf node_modules
WORKDIR /app

# Build TypeScript Backend
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Fix permissions for appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Create .codex directory for Codex authentication
RUN mkdir -p /home/appuser/.codex

# Configure git to trust /workspace directory
# This prevents "fatal: detected dubious ownership" errors when git operations
# are performed in mounted volumes or repos cloned by different users
RUN git config --global --add safe.directory /workspace && \
    git config --global --add safe.directory '/workspace/*'

# Expose port
EXPOSE 3000

# Setup Codex authentication from environment variables, then start app
CMD ["sh", "-c", "npm run setup-auth && npm start"]
