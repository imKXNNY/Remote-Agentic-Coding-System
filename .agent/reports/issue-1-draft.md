# Issue Draft: /setcwd command doesn't switch codebase context

## Description
When I switch to an already existing workspace by using the `/setcwd` command, it changes the working directory but doesn't switch the connected Repo!

## Steps to Reproduce
1. Clone Project A: `/clone https://github.com/user/project-a`
2. Clone Project B: `/clone https://github.com/user/project-b`
3. Switch to Project B: `/setcwd /workspace/project-b`
4. Check status: `/status`

## Actual Result
- Working directory: `/workspace/project-b`
- Codebase: `project-a`
- Repository: `https://github.com/user/project-a`

## Expected Result
- Working directory: `/workspace/project-b`
- Codebase: `project-b`
- Repository: `https://github.com/user/project-b`

## Acceptance Criteria
- [x] `/setcwd` automatically detects if the path belongs to a known codebase.
- [x] `/setcwd` updates the `codebase_id` and `ai_assistant_type` of the conversation.
- [x] `/setcwd` clears the codebase context if the path is outside any known codebase.
- [x] Session is reset upon context switch to ensure AI uses new context.

## Labels
- bug
- priority-high
- codebase-management
