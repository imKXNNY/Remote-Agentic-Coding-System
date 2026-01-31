-- Migration 006: Multi-Directory Support
-- Adds additional_dirs to conversations table to support monorepo and cross-repo tasks

ALTER TABLE remote_agent_conversations 
ADD COLUMN IF NOT EXISTS additional_dirs TEXT[];

COMMENT ON COLUMN remote_agent_conversations.additional_dirs IS 'Array of additional directories (full paths) for the AI assistant to access beyond the primary CWD';
