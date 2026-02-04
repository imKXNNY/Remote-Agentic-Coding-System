-- Migration 010: Webhook policy and approval gate metadata

ALTER TABLE remote_agent_automation_runs
  ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(10),
  ADD COLUMN IF NOT EXISTS policy_decision VARCHAR(30),
  ADD COLUMN IF NOT EXISTS policy_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_runs_policy_decision
  ON remote_agent_automation_runs(policy_decision, created_at DESC);
