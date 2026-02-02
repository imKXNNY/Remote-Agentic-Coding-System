import { pool } from './connection';

/**
 * Ensures additive columns introduced by later migrations exist.
 * This protects runtime paths when older databases missed a migration.
 */
export async function ensureSchemaCompatibility(): Promise<void> {
  await pool.query(`
    ALTER TABLE remote_agent_codebases
    ADD COLUMN IF NOT EXISTS sandbox_mode VARCHAR(50) DEFAULT 'workspace-write'
  `);

  await pool.query(`
    ALTER TABLE remote_agent_conversations
    ADD COLUMN IF NOT EXISTS model_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS additional_dirs TEXT[],
    ADD COLUMN IF NOT EXISTS last_bootstrap_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS bootstrap_status VARCHAR(20) DEFAULT 'pending'
  `);
}
