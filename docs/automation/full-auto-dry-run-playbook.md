# Full-Auto Dry-Run Playbook (Milestone v3 P1)

Issue: #49

## Objective
Validate the autonomous development loop end-to-end under guardrails, while keeping final merge manual.

## Allowed Intervention Points
- Configure test inputs (seed issue/comment/event)
- Trigger explicit review-iteration polling
- Approve/merge manually after all checks are green

No manual source-code edits are allowed outside agent-driven workflow steps.

## Phases and Evidence

### 1) Trigger Intake
- Trigger via a test issue/PR comment or webhook event.
- Evidence:
  - Trigger source link
  - Run ID + chain ID from API or logs

### 2) Guardrail/Policy Decision
- Verify policy decision (`allow` / `requires_approval` / `blocked`).
- Evidence:
  - `/api/github/webhook-runs` entry
  - `/api/github/webhook-runs/:runId/events` timeline

### 3) Autonomous Execution
- Agent executes defined workflow steps and pushes branch changes.
- Evidence:
  - Branch name
  - Commit SHAs
  - PR URL

### 4) Review Iteration
- Poll checks + CodeRabbit comments; apply follow-up commit if needed.
- Evidence:
  - checks output
  - follow-up commit(s)
  - final clean review state

### 5) Merge-Ready Gate
- Ensure all required checks green and no unresolved blockers.
- Evidence:
  - `gh pr checks <pr>` output
  - merge state = CLEAN

### 6) Deterministic Failure Probe (Mandatory)
- Execute one synthetic invalid-input case and verify deterministic response.
- Recommended probe:
  - OpenClaw `/events` command without `<runId>`
  - expected `400` + `invalid_command_arguments`
- Evidence:
  - command/request payload
  - response payload/status
  - test output reference

## Completion Criteria
Dry-run is complete only when all phases have evidence and an execution report is filed.
