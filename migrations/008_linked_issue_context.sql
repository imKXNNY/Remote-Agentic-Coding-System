-- Migration 008: Conversation-level linked issue context
-- Persists linked issue context independently of active sessions.

ALTER TABLE remote_agent_conversations
ADD COLUMN IF NOT EXISTS linked_issue JSONB;

COMMENT ON COLUMN remote_agent_conversations.linked_issue IS
'Conversation-level linked issue context: { owner, repo, number, title?, linkedAt }';
