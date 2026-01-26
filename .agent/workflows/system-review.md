---
description: Analyze process quality (plan vs implementation) and propose improvements
argument-hint: [report-name]
---

# System Review

## Purpose
System review is NOT code review. You are looking for process gaps that caused friction or risk.

## Inputs
- Use the latest execution report (or `$ARGUMENTS` if provided)
- Use the plan file referenced by the execution report

## Analyze
1) Plan quality
   - Were acceptance criteria clear?
   - Were dependencies/tools discovered early enough?
   - Was the work sliced appropriately?

2) Execution quality
   - Where did we diverge and why?
   - Which divergence was justified vs avoidable?

3) Validation quality
   - Were the right tests run?
   - Did failures get caught early?

4) Documentation quality
   - Did docs get updated when needed?

## Output
Save to: `.agent/reports/system-reviews/<report-name>.md`

Include:
- 3–7 concrete process improvements
- Workflow/rules updates recommended (specific file + change)
- Automation opportunities (lint hooks, CI improvements, templates)
