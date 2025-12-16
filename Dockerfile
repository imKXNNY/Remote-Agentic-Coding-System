FROM node:20-slim

ARG GEMINI_CLI_VERSION=0.21.0

# Prevent interactive prompts during installation and ensure npm global binaries stay on PATH
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/bin:${PATH}"

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

# Create non-root user for running Claude Code
# Claude Code refuses to run with --dangerously-skip-permissions as root for security
RUN useradd -m -u 1001 -s /bin/bash appuser \
    && mkdir -p /workspace \
    && chown -R appuser:appuser /app /workspace

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Install Gemini CLI globally so docker images always include the binary
RUN npm install -g @google/gemini-cli@${GEMINI_CLI_VERSION} \
    && npm cache clean --force

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Fix permissions for appuser and provision shared auth directories
RUN chown -R appuser:appuser /app \
    && mkdir -p /home/appuser/.gemini \
    && chown -R appuser:appuser /home/appuser/.gemini

# Switch to non-root user
USER appuser

# Create auth directories for Codex and Gemini (Gemini used via CLI)
RUN mkdir -p /home/appuser/.codex /home/appuser/.gemini

# Configure git to trust /workspace directory
# This prevents "fatal: detected dubious ownership" errors when git operations
# are performed in mounted volumes or repos cloned by different users
RUN git config --global --add safe.directory /workspace && \
    git config --global --add safe.directory '/workspace/*'

# Expose port
EXPOSE 3000

# Setup Codex authentication from environment variables, then start app
CMD ["sh", "-c", "npm run setup-auth && npm start"]
