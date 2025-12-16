---
description: Prepare and file a high-quality Pull Request for merging a feature branch
documentation-hint: [base-branch]
---

# Create Pull Request

Use this command after a feature/fix branch is complete and you need to open a PR against `main` (or another integration branch such as `staging`). Follow each step to ensure the PR is production-ready and communicates the work clearly.

## 1. Branch Hygiene & Sync

1. Confirm you are on the feature branch:
   ```bash
git status -sb
```
2. Fetch latest changes and sync with the destination branch (default `main`, override via `$ARGUMENTS`):
   ```bash
BASE=${ARGUMENTS:-main}
git fetch origin
# Prefer rebase to keep history linear
git rebase origin/$BASE
# Resolve conflicts if any, then rerun tests
```
3. Push the rebased branch (force-with-lease only when necessary):
   ```bash
git push --force-with-lease origin $(git branch --show-current)
```

## 2. Validation & Evidence

Before filing the PR, ensure all quality gates pass:

- ✅ `npm run lint`, `npm run test`, `npm run build` (or project-specific suite)
- ✅ Integration / e2e tests relevant to the change
- ✅ Security checks / secret scans if required
- ✅ Manual verification steps noted in the plan
- Capture logs or screenshots for non-automated validation; they will be referenced in the PR.

## 3. Change Summary Artifact

1. Review the diff and collect highlights:
   ```bash
git diff origin/$BASE...HEAD
```
2. Summarize:
   - **What**: key features/fixes
   - **Why**: problem addressed / link to tickets (Jira/GitHub issues)
   - **How**: notable implementation details or design decisions
3. List validation evidence (commands, screenshots, links to CI runs).

## 4. Update Documentation & Checklists

- Ensure README/CHANGELOG/docs reflect new behavior
- Update tracking docs (PRD, TASK.md, TODO.md) if statuses changed
- Verify version bumps or schema migrations are documented
- Make sure all commits have sensible messages; squash locally if needed

## 5. Create the Pull Request

Use the GitHub CLI template below (or create via UI with same content):

```bash
BRANCH=$(git branch --show-current)
BASE=${ARGUMENTS:-main}
SUMMARY="<one-line summary>"
BODY_FILE=$(mktemp)
cat > "$BODY_FILE" <<'PR'
## Summary
- 

## Testing
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Other: 

## Checklist
- [ ] Documentation updated
- [ ] Environment variables documented
- [ ] Screenshots / logs attached if UI/API changes
- [ ] Linked issue / task reference

## Risks & Mitigations
- Risk: 
- Mitigation: 
PR

gh pr create --base "$BASE" --head "$BRANCH" --title "$SUMMARY" --body-file "$BODY_FILE"
```

Best practices:
- Keep the title concise: `<type>: <short description>` (e.g., `feat: add branding validator`)
- Reference issues (`Fixes #123`) when applicable
- Attach screenshots or GIFs for UI changes via `gh pr view --web --add-review` or by editing PR after creation
- Double-check assignees, reviewers, and labels (QA, needs-review, etc.)

## 6. Professional Follow-Up

After filing the PR:
- Monitor CI pipelines; fix failures promptly
- Respond to reviewer feedback with context-rich replies
- Update the PR description if scope changes
- Once approved, follow merge strategy (squash/merge/rebase) defined by the repository
- Post-merge: delete the branch if policy allows and ensure deployment/runbooks are triggered as needed

By adhering to this command, every PR will be audit-ready, easy to review, and aligned with team standards.
