# Gemini Assistant Setup (CLI)

To keep the Remote Coding Agent “credit free,” Gemini is integrated through the
[Gemini CLI](https://github.com/google-gemini/gemini-cli) instead of the hosted
API. The CLI runs locally, provides the same auto-approved code execution tools,
and uses your existing Gemini CLI login (OAuth or local credentials).

## Prerequisites

- Node.js **20+** (Gemini CLI requirement)
- The `gemini` CLI installed globally (`npm install -g @google/gemini-cli` or
  `brew install gemini-cli`)
- Completed `gemini login` (OAuth) _or_ a CLI `.env` file that points at your own
  Vertex/Gemini project
- Ability to run the CLI inside the same workspace as the Remote Coding Agent

## Environment Variables

No API keys are stored in this repo. Instead, optionally configure where the CLI
binary lives so the orchestrator can spawn it:

| Variable | Purpose | Example |
|----------|---------|---------|
| `GEMINI_CLI_PATH` | Absolute path to the `gemini` binary (falls back to `$PATH`). | `/usr/local/bin/gemini` |
| `GEMINI_CLI_ARGS` | Extra default flags (comma-separated) to append when the agent runs the CLI. | `--model=gemini-2.5-flash,--debug` |

All authentication still happens inside the CLI (e.g., `gemini login`). Any CLI
settings under `.gemini/` are respected automatically because we launch the CLI
from each codebase’s working directory.

## Install & Authenticate

```bash
# 1. Install the CLI
npm install -g @google/gemini-cli
# or: brew install gemini-cli

# 2. Log in once (saves tokens under ~/.gemini/)
gemini login
```

If you prefer API keys or Vertex, follow the CLI’s
[authentication guide](https://geminicli.com/docs/get-started/authentication/).
Those settings live outside of this project.

## Validate the CLI

Before wiring Gemini into conversations, confirm the CLI can stream JSON:

```bash
gemini --output-format stream-json --prompt "Gemini CLI smoke test" | head
```

You should see JSONL events (`init`, `message`, `result`, etc.). Failures usually
mean you still need to log in, accept a TOS prompt, or install system
dependencies.

## Docker Deployments

- The Docker image built from this repo already installs `@google/gemini-cli@0.21.0`.
- After `docker compose build`, verify and authenticate inside the running container:

  ```bash
  docker compose exec app gemini --version        # or: app-with-db profile
  docker compose exec app gemini login
  ```

- Persist the CLI’s `~/.gemini` directory by mounting a host path or volume:

  ```yaml
  services:
    app:
      volumes:
        - ${WORKSPACE_PATH:-./workspace}:/workspace
        - ./gemini:/home/appuser/.gemini
  ```

  Replace `./gemini` with an absolute host path or Docker named volume. If you prefer supplying a custom binary (instead of the baked one), mount it and point `GEMINI_CLI_PATH` to the mounted location—see the environment variable table above.

- When `DEFAULT_AI_ASSISTANT=gemini`, the server now fails fast if the CLI cannot be executed. Run `docker compose exec app gemini --version` anytime you update the image to confirm the binary remains reachable.

## Workflow Notes

- Sessions are stored under `~/.gemini/tmp/...`. The Remote Coding Agent saves
  the session UUID from each CLI run so `/plan` → `/execute` resumes naturally.
- Tool calls (shell/file operations) already flow through the CLI, so the agent
  doesn’t prompt for permissions—the CLI handles approvals. You can force this
  by enabling YOLO mode (`--yolo`) in `GEMINI_CLI_ARGS` or your CLI settings.
- `.gemini/commands` folders behave like `.claude/commands`: `/clone` and the
  GitHub adapter will auto-detect them.

If you see runtime issues, run the CLI manually in the same repo, fix any login
or quota prompts, then rerun the Remote Coding Agent. All CLI stderr is piped
through as `[Gemini CLI] ...` messages for debugging.
