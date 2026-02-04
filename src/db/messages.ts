/**
 * Database operations for chat messages
 */
import { pool } from './connection';
import { isUuid } from '../utils/uuid';

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<Message> {
  const result = await pool.query<Message>(
    'INSERT INTO remote_agent_messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
    [conversationId, role, content]
  );
  return result.rows[0];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  // Gracefully handle non-UUID strings (like initial WebUI 'default-TIMESTAMP' IDs)
  // to avoid Postgres syntax errors.
  if (!isUuid(conversationId)) {
    return [];
  }

  const result = await pool.query<Message>(
    'SELECT id, conversation_id, role, content, timestamp FROM remote_agent_messages WHERE conversation_id = $1 ORDER BY timestamp ASC',
    [conversationId]
  );
  return result.rows;
}
