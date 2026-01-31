/**
 * Telemetry utility for tracking AI performance metrics
 */
import { pool } from '../db/connection';

export interface TelemetryEvent {
  conversation_id: string;
  assistant_type: string;
  model_id?: string;
  latency_to_first_token_ms?: number;
  latency_total_ms?: number;
  status: 'success' | 'error' | 'timeout';
  error_message?: string;
  token_count?: number;
}

export async function logTelemetry(event: TelemetryEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO remote_agent_telemetry 
      (conversation_id, assistant_type, model_id, latency_to_first_token_ms, latency_total_ms, status, error_message, token_count) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.conversation_id,
        event.assistant_type,
        event.model_id || null,
        event.latency_to_first_token_ms || null,
        event.latency_total_ms || null,
        event.status,
        event.error_message || null,
        event.token_count || null
      ]
    );
  } catch (error) {
    console.error('[Telemetry] Failed to log event:', error);
  }
}

export async function getStats(): Promise<Record<string, unknown>[]> {
  const result = await pool.query<Record<string, unknown>>(`
    SELECT 
      assistant_type,
      COUNT(*) as total_requests,
      AVG(latency_to_first_token_ms) as avg_ttft,
      AVG(latency_total_ms) as avg_total_latency,
      COUNT(*) FILTER (WHERE status = 'success')::float / COUNT(*) as success_rate
    FROM remote_agent_telemetry
    GROUP BY assistant_type
  `);
  return result.rows;
}
