import { stat } from 'fs/promises';
import { join, isAbsolute } from 'path';

/**
 * Path utilities for handling Docker vs Host workspace differences
 */

let cachedWorkspaceRoot: string | null = null;

/**
 * Dynamically determines the workspace root.
 * Prioritizes /workspace (Docker mount point) but falls back to WORKSPACE_PATH env or ./workspace.
 */
export async function getWorkspaceRoot(): Promise<string> {
  if (cachedWorkspaceRoot) return cachedWorkspaceRoot;

  const dockerPath = '/workspace';
  try {
    const s = await stat(dockerPath);
    if (s.isDirectory()) {
      cachedWorkspaceRoot = dockerPath;
      return dockerPath;
    }
  } catch {
    // Ignore and fall back
  }

  cachedWorkspaceRoot = process.env.WORKSPACE_PATH || './workspace';
  return cachedWorkspaceRoot;
}

/**
 * Resolves a relative path against the workspace root.
 */
export async function resolveWorkspacePath(relativePath: string): Promise<string> {
  if (isAbsolute(relativePath)) return relativePath;
  const root = await getWorkspaceRoot();
  return join(root, relativePath);
}
