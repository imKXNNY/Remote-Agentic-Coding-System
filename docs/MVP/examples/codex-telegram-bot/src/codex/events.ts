/**
 * Event Processor for Codex Streaming
 *
 * Processes Codex streaming events and formats them for Telegram display
 * Reference: telegram_bot.py lines 544-632
 */

import { CodexEvent, ItemCompletedEvent, TurnCompletedEvent } from './types.js';

/**
 * Processed message ready for Telegram
 */
export interface ProcessedMessage {
  type: 'text' | 'tool' | 'thinking';
  content: string;
  raw?: any;
}

/**
 * Process item.completed event
 *
 * @param event - Item completed event from Codex
 * @returns Processed message or null if should be skipped
 */
export function processItemCompleted(event: ItemCompletedEvent): ProcessedMessage | null {
  const { item } = event;

  switch (item.type) {
    case 'agent_message':
      // Agent text response
      if (item.text) {
        return {
          type: 'text',
          content: item.text,
          raw: item,
        };
      }
      break;

    case 'command_execution':
      // Tool/command execution
      if (item.command) {
        return {
          type: 'tool',
          content: `🔧 ${item.command}`,
          raw: item,
        };
      }
      break;

    case 'reasoning':
      // Agent reasoning/thinking (optional display)
      if (item.text) {
        return {
          type: 'thinking',
          content: `💭 ${item.text}`,
          raw: item,
        };
      }
      break;
  }

  return null;
}

/**
 * Extract screenshot filenames from agent message
 *
 * Looks for common screenshot patterns in text:
 * - .png, .jpg, .jpeg file references
 * - Paths containing ".codex-screenshots/"
 *
 * @param text - Agent message text
 * @returns Array of screenshot filenames found
 */
export function extractScreenshotFilenames(text: string): string[] {
  const screenshots: string[] = [];

  // Pattern 1: Explicit screenshot filenames (e.g., "homepage-after-button.png")
  const filenamePattern = /([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg))/gi;
  const filenameMatches = text.match(filenamePattern);
  if (filenameMatches) {
    screenshots.push(...filenameMatches);
  }

  // Pattern 2: Full paths with .codex-screenshots/
  const pathPattern = /\.codex-screenshots\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg))/gi;
  const pathMatches = [...text.matchAll(pathPattern)];
  for (const match of pathMatches) {
    const filename = match[1];
    if (!screenshots.includes(filename)) {
      screenshots.push(filename);
    }
  }

  return screenshots;
}

/**
 * Check if event indicates turn completion
 *
 * @param event - Codex event
 * @returns True if turn is completed
 */
export function isTurnCompleted(event: CodexEvent): event is TurnCompletedEvent {
  return event.type === 'turn.completed';
}

/**
 * Check if event is item completed
 *
 * @param event - Codex event
 * @returns True if item is completed
 */
export function isItemCompleted(event: CodexEvent): event is ItemCompletedEvent {
  return event.type === 'item.completed';
}

/**
 * Format error message for Telegram
 *
 * @param error - Error object
 * @returns User-friendly error message
 */
export function formatError(error: any): string {
  if (error.message) {
    return `❌ Error: ${error.message}`;
  }
  return `❌ An unexpected error occurred: ${String(error)}`;
}

/**
 * Format thinking/reasoning for display (optional)
 *
 * @param thinking - Thinking text
 * @returns Formatted thinking message
 */
export function formatThinking(thinking: string): string {
  // Truncate long thinking messages
  const maxLength = 200;
  if (thinking.length > maxLength) {
    return `💭 ${thinking.substring(0, maxLength)}...`;
  }
  return `💭 ${thinking}`;
}
