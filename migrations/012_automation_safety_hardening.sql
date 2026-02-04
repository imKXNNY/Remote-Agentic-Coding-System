-- Migration 012: Automation safety hardening primitives
-- Adds circuit breaker state + auditable override ledger.

CREATE TABLE IF NOT EXISTS remote_agent_automation_circuit_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_full_name VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'closed',
  reason TEXT,
  failure_signature VARCHAR(128),
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMP WITH TIME ZONE,
  cooldown_until TIMESTAMP WITH TIME ZONE,
  tripped_at TIMESTAMP WITH TIME ZONE,
  overridden_by VARCHAR(255),
  override_reason TEXT,
  overridden_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_circuit_breakers_status
  ON remote_agent_automation_circuit_breakers(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS remote_agent_automation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type VARCHAR(30) NOT NULL,
  scope_key VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_overrides_scope_created
  ON remote_agent_automation_overrides(scope_type, scope_key, created_at DESC);

