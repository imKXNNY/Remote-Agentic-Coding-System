/**
 * Session Manager for per-user conversation state
 *
 * Stores user sessions as JSON files in telegram_sessions/{user_id}.json
 * Implements thread-per-cwd strategy: new thread created when working directory changes
 *
 * Reference: telegram_bot.py lines 67-210
 */

import * as fs from 'fs';
import * as path from 'path';
import { UserSession } from './types.js';

const SESSIONS_DIR = path.join(process.cwd(), 'telegram_sessions');
const DEFAULT_CWD = '/workspace';

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Get session file path for a user
 */
function getSessionPath(userId: number): string {
  return path.join(SESSIONS_DIR, `${userId}.json`);
}

/**
 * Load user session from disk
 * Returns null if session doesn't exist
 */
export function loadUserSession(userId: number): UserSession | null {
  const sessionPath = getSessionPath(userId);

  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(sessionPath, 'utf-8');
    const session: UserSession = JSON.parse(data);
    return session;
  } catch (error) {
    console.error(`Error loading session for user ${userId}:`, error);
    return null;
  }
}

/**
 * Save user session to disk
 */
export function saveUserSession(userId: number, session: UserSession): void {
  ensureSessionsDir();
  const sessionPath = getSessionPath(userId);

  // Load existing data to preserve fields
  let existingData: Partial<UserSession> = {};
  if (fs.existsSync(sessionPath)) {
    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      existingData = JSON.parse(data);
    } catch (error) {
      // Ignore errors, will create fresh session
    }
  }

  // Update session data
  const sessionData: UserSession = {
    user_id: userId,
    cwd: session.cwd || existingData.cwd || DEFAULT_CWD,
    thread_id: session.thread_id,
    created_at: existingData.created_at || new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };

  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  console.log(`Saved session for user ${userId}`);
}

/**
 * Set working directory for a user
 * IMPORTANT: This clears the thread_id to force creation of a new thread
 * with the new working directory (thread-per-cwd strategy)
 */
export function setUserCwd(userId: number, cwd: string): void {
  ensureSessionsDir();
  const sessionPath = getSessionPath(userId);

  // Load existing data
  let sessionData: Partial<UserSession> = {};
  if (fs.existsSync(sessionPath)) {
    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      sessionData = JSON.parse(data);
    } catch (error) {
      // Ignore errors, will create fresh session
    }
  }

  // Update cwd and clear thread_id (new thread will be created)
  const updatedSession: UserSession = {
    user_id: userId,
    cwd: cwd,
    thread_id: undefined, // Clear thread_id - new thread will be created with new cwd
    created_at: sessionData.created_at || new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };

  fs.writeFileSync(sessionPath, JSON.stringify(updatedSession, null, 2));
  console.log(`Set cwd for user ${userId}: ${cwd} (thread_id cleared)`);
}

/**
 * Get working directory for a user
 * Returns default if no session exists
 */
export function getUserCwd(userId: number): string {
  const session = loadUserSession(userId);
  return session?.cwd || DEFAULT_CWD;
}

/**
 * Clear user session (removes thread_id, preserves cwd)
 * Used for /reset command
 */
export function clearUserSession(userId: number): void {
  const sessionPath = getSessionPath(userId);

  if (!fs.existsSync(sessionPath)) {
    return;
  }

  try {
    const data = fs.readFileSync(sessionPath, 'utf-8');
    const existingSession: UserSession = JSON.parse(data);

    // Keep cwd, remove thread_id
    const clearedSession: UserSession = {
      user_id: userId,
      cwd: existingSession.cwd || DEFAULT_CWD,
      thread_id: undefined, // Clear thread_id
      created_at: existingSession.created_at,
      last_updated: new Date().toISOString(),
    };

    fs.writeFileSync(sessionPath, JSON.stringify(clearedSession, null, 2));
    console.log(`Cleared session for user ${userId} (cwd preserved)`);
  } catch (error) {
    console.error(`Error clearing session for user ${userId}:`, error);
  }
}

/**
 * Get or create a user session
 * Useful for ensuring a session exists before operations
 */
export function getOrCreateSession(userId: number): UserSession {
  let session = loadUserSession(userId);

  if (!session) {
    session = {
      user_id: userId,
      cwd: DEFAULT_CWD,
      thread_id: undefined,
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };
    saveUserSession(userId, session);
  }

  return session;
}
