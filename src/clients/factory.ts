/**
 * AI Assistant Client Factory
 *
 * Dynamically instantiates the appropriate AI assistant client based on type string.
 * Supports Claude and Codex assistants.
 */
import { IAssistantClient } from '../types';
import { ClaudeClient } from './claude';
import { CodexClient } from './codex';
import { GeminiClient } from './gemini';

/**
 * Get the appropriate AI assistant client based on type
 *
 * @param type - Assistant type identifier ('claude' or 'codex')
 * @returns Instantiated assistant client
 * @throws Error if assistant type is unknown
 */
export function getAssistantClient(type: string): IAssistantClient {
  switch (type) {
    case 'claude':
      return new ClaudeClient();
    case 'codex':
      return new CodexClient();
    case 'gemini':
      return new GeminiClient();
    default:
      throw new Error(`Unknown assistant type: ${type}. Supported types: 'claude', 'codex', 'gemini'`);
  }
}
