/**
 * Database operations for conversations
 */
import { pool } from './connection';
import { Conversation, LinkedIssueRef } from '../types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeLinkedIssue(linkedIssue: Conversation['linked_issue']): LinkedIssueRef | null {
  if (linkedIssue === null) {
    return null;
  }

  const candidate = linkedIssue as Partial<LinkedIssueRef>;
  if (
    !isNonEmptyString(candidate.owner) ||
    !isNonEmptyString(candidate.repo) ||
    typeof candidate.number !== 'number' ||
    !Number.isInteger(candidate.number) ||
    candidate.number <= 0
  ) {
    throw new Error('Invalid linked_issue payload: expected owner/repo and positive issue number');
  }

  const normalized: LinkedIssueRef = {
    owner: candidate.owner.trim(),
    repo: candidate.repo.trim(),
    number: candidate.number,
    linkedAt: isNonEmptyString(candidate.linkedAt) ? candidate.linkedAt : new Date().toISOString(),
  };

  if (isNonEmptyString(candidate.title)) {
    normalized.title = candidate.title;
  }

  return normalized;
}

export async function getOrCreateConversation(
  platformType: string,
  platformId: string,
  codebaseId?: string
): Promise<Conversation> {
  const existing = await pool.query<Conversation>(
    'SELECT * FROM remote_agent_conversations WHERE platform_type = $1 AND platform_conversation_id = $2',
    [platformType, platformId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  // Determine assistant type from codebase or environment
  let assistantType = process.env.DEFAULT_AI_ASSISTANT ?? 'claude';
  if (codebaseId) {
    const codebase = await pool.query<{ ai_assistant_type: string }>(
      'SELECT ai_assistant_type FROM remote_agent_codebases WHERE id = $1',
      [codebaseId]
    );
    if (codebase.rows[0]) {
      assistantType = codebase.rows[0].ai_assistant_type;
    }
  }

  const created = await pool.query<Conversation>(
    'INSERT INTO remote_agent_conversations (platform_type, platform_conversation_id, ai_assistant_type) VALUES ($1, $2, $3) RETURNING *',
    [platformType, platformId, assistantType]
  );

  return created.rows[0];
}

export async function updateConversation(
  id: string,
  updates: Partial<
    Pick<
      Conversation,
      | 'codebase_id'
      | 'cwd'
      | 'ai_assistant_type'
      | 'model_id'
      | 'linked_issue'
      | 'additional_dirs'
      | 'last_bootstrap_at'
      | 'bootstrap_status'
    >
  >
): Promise<void> {
  const fields: string[] = [];
  const values: (string | null | Date | string[] | Record<string, unknown>)[] = [];
  let i = 1;

  if (updates.codebase_id !== undefined) {
    fields.push(`codebase_id = $${String(i++)}`);
    values.push(updates.codebase_id);
  }
  if (updates.cwd !== undefined) {
    fields.push(`cwd = $${String(i++)}`);
    values.push(updates.cwd);
  }
  if (updates.ai_assistant_type !== undefined) {
    fields.push(`ai_assistant_type = $${String(i++)}`);
    values.push(updates.ai_assistant_type);
  }
  if (updates.model_id !== undefined) {
    fields.push(`model_id = $${String(i++)}`);
    values.push(updates.model_id);
  }
  if (updates.linked_issue !== undefined) {
    fields.push(`linked_issue = $${String(i++)}`);
    values.push(normalizeLinkedIssue(updates.linked_issue) as unknown as Record<string, unknown> | null);
  }
  if (updates.additional_dirs !== undefined) {
    fields.push(`additional_dirs = $${String(i++)}`);
    values.push(updates.additional_dirs);
  }
  if (updates.last_bootstrap_at !== undefined) {
    fields.push(`last_bootstrap_at = $${String(i++)}`);
    values.push(updates.last_bootstrap_at ?? null);
  }
  if (updates.bootstrap_status !== undefined) {
    fields.push(`bootstrap_status = $${String(i++)}`);
    values.push(updates.bootstrap_status);
  }

  if (fields.length === 0) {
    return; // No updates
  }

  fields.push('updated_at = NOW()');
  values.push(id);

  await pool.query(
    `UPDATE remote_agent_conversations SET ${fields.join(', ')} WHERE id = $${String(i)}`,
    values
  );
}
