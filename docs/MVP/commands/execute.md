---
description: Execute a development plan with GitHub workflow and pull request creation
argument-hint: [branch-name] [plan-file-path]
---

# Execute Development Plan with GitHub Workflow

You are about to execute a comprehensive development plan with complete GitHub workflow - implementing the feature and creating a pull request.

## Critical Requirements

**MANDATORY**: This command must complete ALL steps including pull request creation. The PR is the final deliverable. DO NOT stop until the PR is created and its URL is reported.

## Step 1: Checkout Feature Branch and Read Plan

**Arguments provided in**: $ARGUMENTS
- **$1**: Branch name (e.g., `feature/add-contributing-section`)
- **$2**: Plan file path (e.g., `.agents/plans/add-contributing-section.md`)

**Example**: `feature/add-contributing-section .agents/plans/add-contributing-section.md`

### 1.1 Verify GitHub CLI Access
```bash
gh auth status
```
- Confirm we can create PRs when ready

### 1.2 Fetch Latest Changes
```bash
git fetch origin
```
- Ensure we have latest branch information

### 1.3 Checkout Feature Branch
```bash
# Use $1 for branch name
git checkout $1
```

**If branch doesn't exist locally**:
```bash
git checkout -b $1 origin/$1
```

**Confirm checkout**:
```bash
git branch --show-current
```

Log: "✅ Checked out feature branch: $1"

### 1.4 Pull Latest Changes from Branch
```bash
# Ensure we have latest changes
git pull origin $1
```
- Ensure we have the latest version including the plan file

### 1.5 Read the Plan File

**Read the plan file using $2**:
```bash
cat $2
```

The plan file will contain:
- A list of tasks to implement
- References to existing codebase components and integration points
- Context about where to look in the codebase for implementation
- GitHub workflow metadata (PR title, validation commands, etc.)

**Store plan path for later reference**:
```bash
PLAN_FILE="$2"
echo "Using plan file: ${PLAN_FILE}"
```

Log: "✅ Plan file loaded: $2"

## Step 2: Codebase Analysis

Before implementation begins:
1. Analyze ALL integration points mentioned in the plan
2. Use Grep and Glob tools to:
   - Understand existing code patterns
   - Identify where changes need to be made
   - Find similar implementations for reference
3. Read all referenced files and components
4. Build a comprehensive understanding of the codebase context

## Step 3: Implementation Cycle

For EACH task in sequence:

### 3.1 Implement
- Execute the implementation based on:
  - The task requirements from the plan
  - Your codebase analysis findings
  - Best practices and existing patterns
- Make all necessary code changes
- Ensure code quality and consistency

### 3.2 Proceed to Next
- Move to the next task in the list
- Repeat until all tasks are complete

**CRITICAL**: Complete each task fully before starting the next. Follow the dependency order specified in the plan.

## Step 4: Comprehensive Validation Phase

After ALL implementation tasks are complete, run ALL validation commands from the plan:

### 4.1 Type Checking & Linting
```bash
npm run type-check
npm run lint
npm run format:check
```

**If any fail**: Fix issues immediately, update code, re-run validations

### 4.2 Unit Tests
```bash
npm test
```

**Expected**: All tests pass with 100% success rate

**If tests fail**: Debug and fix until all tests pass

### 4.3 Build Verification
```bash
npm run build
```

**Expected**: Clean build with no errors

### 4.4 Manual Testing

Follow any manual validation steps specified in the plan.

**CRITICAL**: Do NOT proceed to PR creation until ALL validations pass. The PR must represent fully validated, working code.

## Step 5: Commit All Changes

**Create a conventional commit with all changes**:

1. **Stage all changes**:
   ```bash
   git add .
   ```

2. **Review what's being committed**:
   ```bash
   git status
   git diff --staged --stat
   ```

3. **Extract commit message from plan** (look for PR Title in Feature Metadata)

   **Commit with conventional format**:
   ```bash
   git commit -m "<type>: <description>

   <optional body with more details>

   - List key changes
   - Reference plan file
   - Note validation status

   🤖 Generated with Remote Coding Agent"
   ```

   Example:
   ```bash
   git commit -m "feat: Add dark mode toggle to header

   Implemented user-configurable dark mode with:
   - DarkModeToggle component with state persistence
   - CSS variable-based theme switching
   - Context API for global theme state

   Implementation Plan: .agents/plans/add-dark-mode.md
   All validations passed: type-check, lint, tests, build

   🤖 Generated with Remote Coding Agent"
   ```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

## Step 6: Push Feature Branch

**Push updated branch to remote repository**:
```bash
# Branch already exists (created by plan-feature), so just push new commits
git push origin $1
```

**Verify push succeeded**:
```bash
git branch -vv
```

Log: "✅ Pushed implementation commits to branch: $1"

## Step 7: Create Pull Request (FINAL DELIVERABLE)

**This is the most critical step - DO NOT SKIP OR FAIL TO COMPLETE**

### 7.1 Extract PR Metadata from Plan

- **PR Title**: Found in Feature Metadata section
- **PR Body**: Use the PR template from the plan, filling in:
  - Summary of what was implemented
  - List of files changed
  - Tests added/updated
  - Validation results
  - Link to plan file

### 7.2 Generate Comprehensive PR Description

Create PR body with this structure:

```markdown
## Summary

<Brief description of what this PR accomplishes - from plan>

## Changes

<List key changes made - review git diff>
- Created: <new files>
- Modified: <changed files>
- Deleted: <removed files>

## Implementation Details

<Summarize implementation approach and key decisions>

## Testing

- ✅ Unit tests: <number> tests added/updated
- ✅ Manual testing: <what was verified>

## Validation

All validation commands passed:
- ✅ Type checking (`npm run type-check`)
- ✅ Linting (`npm run lint`)
- ✅ Formatting (`npm run format:check`)
- ✅ Unit tests (`npm test`) - <number> tests, 100% pass rate
- ✅ Build (`npm run build`)

## Related

- Implementation Plan: `${PLAN_FILE}`
- Issue: #<issue-number> (if applicable from plan)

---

🤖 Generated with Remote Coding Agent
```

### 7.3 Create PR with GitHub CLI

**Use heredoc for multi-line PR body**:

```bash
gh pr create --title "<PR-TITLE>" --body "$(cat <<'EOF'
<PR-BODY-CONTENT>
EOF
)"
```

**Actual example using variables**:
```bash
# Extract PR title from plan file
# Use stored variables: $1 (branch name), $PLAN_FILE (plan file path)

gh pr create --title "feat: Add dark mode toggle" --body "$(cat <<EOF
## Summary

Implemented user-configurable dark mode toggle in the application header, allowing users to switch between light and dark themes with persistence across sessions.

## Changes

- Created: \`src/components/DarkModeToggle.tsx\`
- Created: \`src/contexts/ThemeContext.tsx\`
- Modified: \`src/components/Header.tsx\`
- Modified: \`src/styles/variables.css\`
- Created: \`tests/components/DarkModeToggle.test.tsx\`

## Implementation Details

- Implemented toggle component with state persistence to localStorage
- Created React Context for global theme state management
- Added CSS variables for color theming
- Integrated toggle into header component

## Testing

- ✅ Unit tests: 8 tests added (toggle rendering, state changes, persistence)
- ✅ Manual testing: Verified in development environment

## Validation

All validation commands passed:
- ✅ Type checking (\`npm run type-check\`)
- ✅ Linting (\`npm run lint\`)
- ✅ Formatting (\`npm run format:check\`)
- ✅ Unit tests (\`npm test\`) - 8 tests, 100% pass rate
- ✅ Build (\`npm run build\`)

## Related

- Implementation Plan: \`${PLAN_FILE}\`
- Branch: \`$1\`

---

🤖 Generated with Remote Coding Agent
EOF
)"
```

### 7.4 Capture and Report PR URL

After PR creation, capture the URL:
```bash
gh pr view --web
```

**Log to user**:
```
✅ PULL REQUEST CREATED SUCCESSFULLY

PR URL: https://github.com/<org>/<repo>/pull/<number>
Branch: $1
Title: <PR-title>

All validations passed. Feature is ready for review.
```

## Step 8: Final Report

Provide a comprehensive summary:

```markdown
## ✅ Feature Implementation Complete

### Summary
<Brief description of what was built>

### Deliverables
- **Pull Request**: <PR-URL>
- **Branch**: $1
- **Plan**: ${PLAN_FILE}

### Implementation Stats
- Files created: <number>
- Files modified: <number>
- Tests added: <number>
- Commit hash: <hash>

### Validation Results
- ✅ Type checking passed
- ✅ Linting passed
- ✅ Formatting passed
- ✅ All tests passed (<number> tests)
- ✅ Build succeeded

### Next Steps
- PR is ready for review at: <PR-URL>
- Assign reviewers if needed
- Monitor CI/CD checks
- Merge after approval
```

## Workflow Rules

1. **NEVER** skip GitHub workflow steps
2. **NEVER** stop before PR creation - PR is the final deliverable
3. **ALWAYS** checkout the feature branch with the plan file
4. **ALWAYS** run ALL validations before committing
5. **ALWAYS** create PR with comprehensive description
6. **REPORT** PR URL as the final output

## Error Handling

### If Pre-Flight Checks Fail
- **Branch doesn't exist**: Verify branch name is correct and exists on remote
- **Plan file not found**: Ensure plan was committed to the branch before execution
- **GitHub CLI not authenticated**: Ask user to run `gh auth login`

### If Validation Fails
- **Fix immediately** - do not proceed to PR creation
- **Re-run validations** after fixes

### If PR Creation Fails
- **Check GitHub CLI authentication**: `gh auth status`
- **Verify branch is pushed**: `git branch -vv`
- **Check network connectivity**
- **Retry PR creation** after resolving issues
- **DO NOT report success until PR is created**

## Validation Checkpoints

Before moving to next step, verify:

- [ ] **Step 1**: Feature branch checked out, plan file loaded
- [ ] **Step 2**: Codebase analysis complete
- [ ] **Step 3**: All implementation tasks complete
- [ ] **Step 4**: ALL validation commands passed (zero errors)
- [ ] **Step 5**: Changes committed with conventional commit message
- [ ] **Step 6**: Branch pushed to remote
- [ ] **Step 7**: Pull request created successfully
- [ ] **Step 8**: PR URL reported to user

## Success Criteria

Execution is ONLY successful when:
- ✅ All code changes implemented
- ✅ All validations passed (type-check, lint, format, tests, build)
- ✅ Conventional commit created
- ✅ Feature branch pushed to origin
- ✅ **Pull request created with comprehensive description**
- ✅ **PR URL reported to user**

**REMEMBER**: The pull request is the final deliverable. Do not stop until it's created and its URL is shared with the user.
