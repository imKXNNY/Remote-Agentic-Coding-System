---
description: Generate an implementation report after executing a plan
argument-hint: [report-name]
---

# Execution Report

## Goal
Capture what was implemented, what diverged, and how it was verified.

## Save location
Write to: `.agent/reports/execution-reports/<report-name>.md`
If no name is provided, use: `<date>-<issue>-<slug>.md`

## Include

### Meta
- Related Issue: #<id> (or link)
- Branch: <branch>
- Plan file: <path>
- Files added/modified
- Lines changed: +X / -Y (optional)

### What changed
- Key behavior changes (bullets)
- Any migrations or config changes

### Plan adherence
- What matched the plan
- What diverged and why

### Verification
- Commands proposed/run
- Results (pass/fail)
- Notable logs/artifacts locations

### Follow-ups
- Tech debt
- New issues discovered (as Issue Drafts)
