/**
 * Session types for per-user conversation management
 */

export interface UserSession {
  user_id: number;
  cwd: string;
  thread_id?: string;
  created_at: string;
  last_updated: string;
}

export interface SessionManager {
  loadUserSession(userId: number): UserSession | null;
  saveUserSession(userId: number, session: UserSession): void;
  setUserCwd(userId: number, cwd: string): void;
  getUserCwd(userId: number): string;
  clearUserSession(userId: number): void;
}
