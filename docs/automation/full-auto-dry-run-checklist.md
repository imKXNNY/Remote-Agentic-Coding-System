# Full-Auto Dry-Run Checklist

Use this checklist for each Milestone v3 dry-run execution.

## Preflight
- [ ] Target issue selected
- [ ] Clean branch strategy defined
- [ ] Guardrail and policy env configured

## Trigger -> Intake
- [ ] Trigger fired and recorded
- [ ] `runId` + `chainId` captured
- [ ] Intake decision captured

## Execution
- [ ] Branch created by workflow
- [ ] Code changes generated without manual edits outside intervention points
- [ ] PR created and linked

## Review Iteration
- [ ] Checks polled
- [ ] Comments analyzed
- [ ] Follow-up applied (if required)
- [ ] Final state clean

## Failure Probe (Mandatory)
- [ ] Invalid-input probe executed
- [ ] Expected deterministic status confirmed
- [ ] Evidence attached

## Finalization
- [ ] Execution report filed in `.agent/reports/execution-reports/`
- [ ] Issue updated with report + PR/check links
- [ ] Merge decision captured (manual merge policy)
