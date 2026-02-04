import { pool } from './connection';

/**
 * Ensure runtime compatibility by adding additive columns introduced by later migrations.
 *
 * Adds (if absent):
 * - remote_agent_codebases.sandbox_mode VARCHAR(50) DEFAULT 'workspace-write'
 * - remote_agent_conversations.model_id VARCHAR(50)
 * - remote_agent_conversations.linked_issue JSONB
 * - remote_agent_conversations.additional_dirs TEXT[]
 * - remote_agent_conversations.last_bootstrap_at TIMESTAMP WITH TIME ZONE
 * - remote_agent_conversations.bootstrap_status VARCHAR(20) DEFAULT 'pending'
 */
export async function ensureSchemaCompatibility(): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    ALTER TABLE remote_agent_codebases
    ADD COLUMN IF NOT EXISTS sandbox_mode VARCHAR(50) DEFAULT 'workspace-write'
  `);

  await pool.query(`
    ALTER TABLE remote_agent_conversations
    ADD COLUMN IF NOT EXISTS model_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS linked_issue JSONB,
    ADD COLUMN IF NOT EXISTS additional_dirs TEXT[],
    ADD COLUMN IF NOT EXISTS last_bootstrap_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS bootstrap_status VARCHAR(20) DEFAULT 'pending'
  `);

  await pool.query(`
    -- Keep this runtime DDL in sync with migrations/009_webhook_control_plane.sql.
    CREATE TABLE IF NOT EXISTS remote_agent_automation_chains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform_type VARCHAR(20) NOT NULL,
      conversation_id VARCHAR(255) NOT NULL,
      repository_full_name VARCHAR(255) NOT NULL,
      object_type VARCHAR(40) NOT NULL,
      object_number INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      iteration_count INTEGER NOT NULL DEFAULT 0,
      iteration_window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      cooldown_until TIMESTAMP WITH TIME ZONE,
      last_failure_signature VARCHAR(128),
      repeated_failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(platform_type, conversation_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS remote_agent_automation_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chain_id UUID NOT NULL REFERENCES remote_agent_automation_chains(id) ON DELETE CASCADE,
      delivery_id VARCHAR(255) NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      event_type VARCHAR(50) NOT NULL,
      action VARCHAR(50),
      head_sha VARCHAR(64),
      status VARCHAR(30) NOT NULL,
      reason TEXT,
      is_mutating BOOLEAN NOT NULL DEFAULT false,
      failure_signature VARCHAR(128),
      started_at TIMESTAMP WITH TIME ZONE,
      finished_at TIMESTAMP WITH TIME ZONE,
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE remote_agent_automation_runs
    ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(10),
    ADD COLUMN IF NOT EXISTS policy_decision VARCHAR(30),
    ADD COLUMN IF NOT EXISTS policy_reason TEXT,
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS remote_agent_automation_run_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES remote_agent_automation_runs(id) ON DELETE CASCADE,
      chain_id UUID NOT NULL REFERENCES remote_agent_automation_chains(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      status VARCHAR(30),
      message TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS remote_agent_automation_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope_type VARCHAR(30) NOT NULL,
      scope_key VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      actor VARCHAR(255) NOT NULL,
      reason TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_runs_chain_created
      ON remote_agent_automation_runs(chain_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_runs_expires
      ON remote_agent_automation_runs(expires_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_runs_status_created
      ON remote_agent_automation_runs(status, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_chains_status
      ON remote_agent_automation_chains(status, updated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_run_events_run_created
      ON remote_agent_automation_run_events(run_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_run_events_chain_created
      ON remote_agent_automation_run_events(chain_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_circuit_breakers_status
      ON remote_agent_automation_circuit_breakers(status, updated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_remote_agent_automation_overrides_scope_created
      ON remote_agent_automation_overrides(scope_type, scope_key, created_at DESC)
  `);
}
