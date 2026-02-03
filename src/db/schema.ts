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
}
