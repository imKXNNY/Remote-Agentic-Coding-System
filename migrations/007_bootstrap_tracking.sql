-- Migration 007: Bootstrap Tracking
-- Tracks when a conversation/codebase was last provisioned with dependencies

ALTER TABLE remote_agent_conversations 
ADD COLUMN IF NOT EXISTS last_bootstrap_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bootstrap_status VARCHAR(20) DEFAULT 'pending';

COMMENT ON COLUMN remote_agent_conversations.last_bootstrap_at IS 'Timestamp of the last successful environment auto-provisioning run';
COMMENT ON COLUMN remote_agent_conversations.bootstrap_status IS 'Current status of environment setup: pending, running, success, failed, skipped';
