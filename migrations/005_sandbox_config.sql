-- Migration 005: Sandbox and Model Configuration
-- Adds sandbox_mode to codebases and model_id to conversations

ALTER TABLE remote_agent_codebases 
ADD COLUMN IF NOT EXISTS sandbox_mode VARCHAR(50) DEFAULT 'workspace-write';

ALTER TABLE remote_agent_conversations 
ADD COLUMN IF NOT EXISTS model_id VARCHAR(50);

CREATE TABLE IF NOT EXISTS remote_agent_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
    assistant_type VARCHAR(50) NOT NULL,
    model_id VARCHAR(50),
    latency_to_first_token_ms INTEGER,
    latency_total_ms INTEGER,
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'timeout'
    error_message TEXT,
    token_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN remote_agent_codebases.sandbox_mode IS 'Sandbox mode for AI assistants: read-only, workspace-write, or danger-full-access';
COMMENT ON COLUMN remote_agent_conversations.model_id IS 'Specific AI model ID selected for this conversation (e.g., gpt-4o, claude-3-opus)';
COMMENT ON TABLE remote_agent_telemetry IS 'Stores performance metrics and success rates for AI assistant interactions';
