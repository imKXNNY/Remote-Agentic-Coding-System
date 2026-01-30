/**
 * Core type definitions for the Remote Coding Agent platform
 */

export interface Conversation {
  id: string;
  platform_type: string;
  platform_conversation_id: string;
  codebase_id: string | null;
  cwd: string | null;
  ai_assistant_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface Codebase {
  id: string;
  name: string;
  repository_url: string | null;
  default_cwd: string;
  ai_assistant_type: string;
  commands: Record<string, { path: string; description: string }>;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  conversation_id: string;
  codebase_id: string | null;
  ai_assistant_type: string;
  assistant_session_id: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  started_at: Date;
  ended_at: Date | null;
}

export interface CommandResult {
  success: boolean;
  message: string;
  modified?: boolean; // Indicates if conversation state was modified
}

/**
 * Generic platform adapter interface
 * Allows supporting multiple platforms (Telegram, Slack, GitHub, etc.)
 */
export interface IPlatformAdapter {
  /**
   * Send a message to the platform
   */
  sendMessage(conversationId: string, message: string): Promise<void>;

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch';

  /**
   * Get the platform type identifier (e.g., 'telegram', 'github', 'slack')
   */
  getPlatformType(): string;

  /**
   * Start the platform adapter (e.g., begin polling, start webhook server)
   */
  start(): Promise<void>;

  /**
   * Stop the platform adapter gracefully
   */
  stop(): void;
}

/**
 * Message chunk from AI assistant
 */
export interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;
  sessionId?: string;

  // For tool calls
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/**
 * Generic AI assistant client interface
 * Allows supporting multiple AI assistants (Claude, Codex, etc.)
 */
export interface IAssistantClient {
  /**
   * Send a message and get streaming response
   * @param prompt - User message or prompt
   * @param cwd - Working directory for the assistant
   * @param resumeSessionId - Optional session ID to resume
   */
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<MessageChunk>;

  /**
   * Get the assistant type identifier
   */
  getType(): string;
}
