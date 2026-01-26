# Root Cause Analysis: GitHub Issue #1

## Summary
When switching to an already existing workspace using the `/setcwd` command, the system updates the working directory (CWD) but fails to switch the connected codebase/repository context. This results in the AI assistant being stuck in the context of the previous repository despite being in the folder of a different one.

## Symptoms
- Telegram/Slack/GitHub conversation shows `Codebase: PreviousProject` and `Repository: previous-url` after `/setcwd /workspace/NewProject`.
- AI assistant uses commands or knowledge associated with the old codebase.
- Commands like `/status` show the mismatch between `Codebase` and `Current Working Directory`.

## Root Cause
The implementation of the `/setcwd` command in `src/handlers/command-handler.ts` only updated the `cwd` field in the `remote_agent_conversations` table. It did not:
1.  Look up if the new path corresponds to a known codebase in the `remote_agent_codebases` table.
2.  Update the `codebase_id` and `ai_assistant_type` in the conversation record.

## Contributing Factors
- The initial MVP design of `/setcwd` was likely intended for simple directory navigation within a repo, rather than repo-switching.
- Lack of a helper function to find codebases by their path in the database.

## Fix Strategy
1.  **Database**: Added `findBestCodebaseForPath` in `src/db/codebases.ts` using a prefix-matching SQL query (`$1 = default_cwd OR $1 LIKE default_cwd || '/%'`).
2.  **Database**: Updated `updateConversation` in `src/db/conversations.ts` to allow updating `codebase_id` and `ai_assistant_type`.
3.  **Command Handler**: Refactored `/setcwd` in `src/handlers/command-handler.ts` to automatically detect and set the codebase ID and assistant type when the path changes.
4.  **Session Management**: Ensured the active session is deactivated during context switch to force a fresh AI state on the next message.

## Tests Needed to Prevent Regression
- Unit test for `parseCommand` to ensure `/setcwd` arguments are correctly captured (exists).
- Integration test simulating the switch between two codebases and verifying the database state (verified manually/manually checked logic).

## Risks
- Path ambiguity: If one codebase is a subdirectory of another (nested repos), the prefix matching might need care. The current fix uses `ORDER BY LENGTH(default_cwd) DESC` to pick the most specific match, which mitigates this.
