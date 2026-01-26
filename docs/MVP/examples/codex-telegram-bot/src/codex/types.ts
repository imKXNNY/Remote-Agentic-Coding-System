/**
 * Codex SDK types and interfaces
 */

/**
 * Thread configuration options
 */
export interface ThreadOptions {
  workingDirectory: string;
}

/**
 * Codex event types from streaming API
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
 * Base event structure
 */
export interface CodexEvent {
  type: CodexEventType;
  [key: string]: any;
}

/**
 * Item completed event
 */
export interface ItemCompletedEvent extends CodexEvent {
  type: 'item.completed';
  item: {
    type: CodexItemType;
    text?: string;
    command?: string;
    [key: string]: any;
  };
}

/**
 * Turn completed event
 */
export interface TurnCompletedEvent extends CodexEvent {
  type: 'turn.completed';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Thread info
 */
export interface ThreadInfo {
  id: string;
  workingDirectory: string;
}
