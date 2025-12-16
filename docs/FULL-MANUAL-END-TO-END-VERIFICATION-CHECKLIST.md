Here’s a checklist you can follow for a full end-to-end Gemini CLI verification:

**Environment Prep (Bare Metal)**
- Install the CLI locally with `npm install -g @google/gemini-cli` (or Homebrew).
- Run `gemini login` once and confirm `~/.gemini/` contains tokens/settings.
- In `.env`, set `DEFAULT_AI_ASSISTANT=gemini` if you want new conversations to pick Gemini automatically. Optionally set `GEMINI_CLI_PATH` if the binary isn’t on `$PATH`, or `GEMINI_CLI_ARGS` for default flags (e.g., `--model=gemini-2.5-flash`).
- Restart the Remote Coding Agent (`npm run dev`) so it loads the new config.

**Environment Prep (Docker)**
- The Docker image already includes `@google/gemini-cli`, so no host install is required.
- Add a persistent mount for CLI auth, e.g. `- ./gemini:/home/appuser/.gemini` in the `app`/`app-with-db` service volumes, then rebuild containers.
- Run `docker compose exec app gemini --version` (or `app-with-db`) to confirm the binary works inside the container.
- Authenticate inside the container with `docker compose exec app gemini login`. This writes tokens to the mounted `/home/appuser/.gemini` directory so future starts work automatically.
- Restart the stack (`docker compose up -d --build`) to ensure the env picks up `DEFAULT_AI_ASSISTANT=gemini`.

**Smoke Test (CLI only)**
- From any repo directory, run `gemini --output-format stream-json --prompt "smoke test"` (inside the container for Docker deployments) and confirm JSON events stream. Fix any login/TOS prompts now.

**Remote Agent Workflow**
1. `/clone <repo>` a test repo that includes `.gemini/commands` so detection picks Gemini automatically. Verify the response mentions `.gemini/commands`.
2. Run `/command-invoke plan "<short request>"` (or whichever command you use for planning) and watch the stream; look for `[Gemini CLI]` logs in the server console to confirm the CLI is running.
3. After plan, run `/command-invoke execute "<same request>"` to ensure session resume works—logs should show `[Gemini CLI] Resuming session …`.
4. Trigger at least one tool call (e.g., a command that runs shell) and verify Telegram/GitHub displays the `tool` messages emitted from `tool_use` / `tool_result`.
5. Use `/reset` and rerun a command to ensure new sessions start cleanly.

**Fallback Checks**
- Temporarily point `GEMINI_CLI_PATH` to an invalid binary (or bind-mount nothing to `/home/appuser/.gemini`) and restart. With `DEFAULT_AI_ASSISTANT=gemini`, the server now exits immediately with instructions to install/login the CLI.
- Remove the override and restart to confirm normal startup, then run `docker compose exec app gemini --version` to double-check the binary is visible again.

Once all looks good, you can stage/commit/push. Let me know if you hit anything unexpected while running through that list!
