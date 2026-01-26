/**
 * Global type definitions for the Codex Telegram Bot
 */

import { Context as TelegrafContext } from 'telegraf';

/**
 * Extended Telegram context with user information
 */
export interface BotContext extends TelegrafContext {
  // Can be extended with custom properties as needed
}

/**
 * User session data structure
 */
export interface UserSession {
  user_id: number;
  cwd: string;
  thread_id?: string;
  created_at: string;
  last_updated: string;
}

/**
 * Codex thread configuration
 */
export interface ThreadConfig {
  workingDirectory: string;
  skipGitRepoCheck?: boolean;
}

/**
 * Codex event types from streaming
 */
export type CodexEventType =
  | 'thread.started'
  | 'turn.started'
  | 'item.started'
  | 'item.completed'
  | 'turn.completed';

/**
 * Codex item types
 */
export type CodexItemType =
  | 'agent_message'
  | 'command_execution'
  | 'reasoning';

/**
 * Screenshot metadata
 */
export interface ScreenshotInfo {
  name: string;
  path: string;
  mtime: Date;
}
