/**
 * Codex SDK Client Wrapper
 *
 * Provides abstraction layer for Codex SDK with thread management
 * Handles thread creation, resumption, and streaming
 */

import { Codex } from '@openai/codex-sdk';
import { ThreadOptions, ThreadInfo } from './types.js';

// Singleton Codex instance
let codexInstance: Codex | null = null;

/**
 * Get or create Codex SDK instance
 */
export function getCodex(): Codex {
  if (!codexInstance) {
    codexInstance = new Codex();
  }
  return codexInstance;
}

/**
 * Create a new thread with specified working directory
 *
 * @param workingDirectory - Path to working directory
 * @returns Thread object with id and workingDirectory
 */
export function createThread(workingDirectory: string): any {
  const codex = getCodex();
  // NOTE: startThread() is synchronous, returns Thread directly (not a Promise)
  const thread = codex.startThread({ workingDirectory, skipGitRepoCheck: true });
  return thread;
}

/**
 * Resume an existing thread by ID
 *
 * @param threadId - Thread ID to resume
 * @param workingDirectory - Working directory (must match original thread)
 * @returns Thread object
 */
export function resumeThread(threadId: string, workingDirectory: string): any {
  const codex = getCodex();
  // NOTE: resumeThread() is synchronous, returns Thread directly (not a Promise)
  // IMPORTANT: Must pass options when resuming, including skipGitRepoCheck!
  const thread = codex.resumeThread(threadId, {
    workingDirectory,
    skipGitRepoCheck: true,
  });
  return thread;
}

/**
 * Run a prompt on a thread with streaming
 *
 * @param thread - Thread object
 * @param prompt - User prompt to execute
 * @returns Async iterator of events
 */
export async function runStreaming(thread: any, prompt: string): Promise<any> {
  return await thread.runStreamed(prompt);
}

/**
 * Get or create thread for a user
 *
 * @param threadId - Existing thread ID (optional)
 * @param workingDirectory - Working directory for new threads
 * @returns Thread object
 */
export function getOrCreateThread(
  threadId: string | undefined,
  workingDirectory: string
): any {
  if (threadId) {
    try {
      // NOTE: resumeThread() is synchronous
      // IMPORTANT: Must pass workingDirectory to resumeThread!
      return resumeThread(threadId, workingDirectory);
    } catch (error) {
      console.error(`Failed to resume thread ${threadId}, creating new one:`, error);
      // Fall through to create new thread
    }
  }

  // NOTE: createThread() is synchronous
  return createThread(workingDirectory);
}
