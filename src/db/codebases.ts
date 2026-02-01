/**
 * Database operations for codebases
 */
import { pool } from './connection';
import { Codebase } from '../types';

export async function createCodebase(data: {
  name: string;
  repository_url?: string;
  default_cwd: string;
  ai_assistant_type?: string;
  sandbox_mode?: 'read-only' | 'workspace-write' | 'danger-full-access';
}): Promise<Codebase> {
  const assistantType = data.ai_assistant_type ?? 'claude';
  const sandboxMode = data.sandbox_mode ?? 'workspace-write';
  const result = await pool.query<Codebase>(
    'INSERT INTO remote_agent_codebases (name, repository_url, default_cwd, ai_assistant_type, sandbox_mode) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [data.name, data.repository_url ?? null, data.default_cwd, assistantType, sandboxMode]
  );
  return result.rows[0];
}

export async function getCodebase(id: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>('SELECT * FROM remote_agent_codebases WHERE id = $1', [
    id,
  ]);
  return result.rows[0] ?? null;
}

export async function updateCodebaseCommands(
  id: string,
  commands: Record<string, { path: string; description: string }>
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET commands = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(commands), id]
  );
}

export async function getCodebaseCommands(
  id: string
): Promise<Record<string, { path: string; description: string }>> {
  const result = await pool.query<{
    commands: Record<string, { path: string; description: string }>;
  }>('SELECT commands FROM remote_agent_codebases WHERE id = $1', [id]);
  return result.rows[0]?.commands ?? {};
}

export async function registerCommand(
  id: string,
  name: string,
  command: { path: string; description: string }
): Promise<void> {
  const commands = await getCodebaseCommands(id);
  commands[name] = command;
  await updateCodebaseCommands(id, commands);
}

export async function findCodebaseByRepoUrl(repoUrl: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE repository_url = $1',
    [repoUrl]
  );
  return result.rows[0] ?? null;
}
export async function findBestCodebaseForPath(path: string): Promise<Codebase | null> {
  // Find codebases whose default_cwd is a prefix of the given path.
  // We check for an exact match or a match followed by a path separator.
  // Order by length descending to get the most specific match (deepest directory)
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE $1 = default_cwd OR $1 LIKE default_cwd || \'/%\' ORDER BY LENGTH(default_cwd) DESC LIMIT 1',
    [path]
  );
  return result.rows[0] ?? null;
}
export async function updateCodebaseSandboxMode(
  id: string,
  mode: 'read-only' | 'workspace-write' | 'danger-full-access'
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET sandbox_mode = $1, updated_at = NOW() WHERE id = $2',
    [mode, id]
  );
}
