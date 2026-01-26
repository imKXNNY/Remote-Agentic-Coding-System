---
description: Fix issues found during code review
argument-hint: [review-file-path or inline-review-text] [optional-scope]
---

# Code Review Fix

## Inputs
`$ARGUMENTS` should contain:
- Review source (file path or pasted text)
- Optional scope/constraints

## Process
1) If the review source is a file path, read it fully first.
2) Create an ordered fix list (blockers first).
3) Apply fixes one by one:
   - Explain what was wrong
   - Show the fix (diff/patch or code snippets)
   - Add/update relevant tests when feasible
4) Re-run validation:
   - Prefer `.agent/workflows/validate-simple.md`
   - Use `.agent/workflows/validate.md` only if required by repo DoD

## Output
- List of fixes applied
- Tests/validation results
- Any follow-up issues as Issue Drafts
