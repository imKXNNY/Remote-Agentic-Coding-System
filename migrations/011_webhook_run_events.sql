-- Migration 011: Webhook run lifecycle event ledger for observability/audit

CREATE TABLE IF NOT EXISTS remote_agent_automation_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES remote_agent_automation_runs(id) ON DELETE CASCADE,
  chain_id UUID NOT NULL REFERENCES remote_agent_automation_chains(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  status VARCHAR(30),
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_run_events_run_created
  ON remote_agent_automation_run_events(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_run_events_chain_created
  ON remote_agent_automation_run_events(chain_id, created_at DESC);
