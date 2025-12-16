import { spawn } from 'child_process';
import * as readline from 'readline';
import { IAssistantClient, MessageChunk } from '../types';

interface InitEvent {
  type: 'init';
  session_id?: string;
}

interface MessageEvent {
  type: 'message';
  role?: string;
  content?: string;
  delta?: boolean;
}

interface ToolUseEvent {
  type: 'tool_use';
  tool_name?: string;
  parameters?: Record<string, unknown>;
  tool_id?: string;
}

interface ToolResultEvent {
  type: 'tool_result';
  tool_id?: string;
  tool_name?: string;
  status?: string;
  output?: string;
}

interface ErrorEvent {
  type: 'error';
  message?: string;
}

interface ResultEvent {
  type: 'result';
  status?: string;
}

type StreamEvent = InitEvent | MessageEvent | ToolUseEvent | ToolResultEvent | ErrorEvent | ResultEvent;

const DEFAULT_BINARY = 'gemini';

function parseExtraArgs(): string[] {
  const raw = process.env.GEMINI_CLI_ARGS;
  if (!raw) return [];
  return raw
    .split(',')
    .map(arg => arg.trim())
    .filter(Boolean);
}

function ensureFlag(args: string[], flag: string, requiresValue = false, value?: string): void {
  const hasStandalone = args.includes(flag);
  const hasWithValue = args.some(arg => arg.startsWith(`${flag}=`));
  if (hasStandalone || hasWithValue) {
    return;
  }

  if (requiresValue && value !== undefined) {
    args.push(flag, value);
    return;
  }

  args.push(flag);
}

export class GeminiClient implements IAssistantClient {
  private readonly binary: string;
  private readonly defaultArgs: string[];

  constructor() {
    this.binary = process.env.GEMINI_CLI_PATH ?? DEFAULT_BINARY;
    this.defaultArgs = parseExtraArgs();
  }

  getType(): string {
    return 'gemini';
  }

  async *sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<MessageChunk> {
    const args = [...this.defaultArgs];
    ensureFlag(args, '--output-format', true, 'stream-json');
    ensureFlag(args, '--yolo');

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
      console.log(`[Gemini CLI] Resuming session ${resumeSessionId}`);
    } else {
      console.log('[Gemini CLI] Starting new session');
    }

    args.push(`--prompt=${prompt}`);

    let resolvedSessionId = resumeSessionId;
    let sawResult = false;

    const child = spawn(this.binary, args, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = child.stdout;
    const stderr = child.stderr;

    stdout.setEncoding('utf-8');
    stderr.setEncoding('utf-8');

    stderr.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text) {
        console.error(`[Gemini CLI] ${text}`);
      }
    });

    const rl = readline.createInterface({ input: stdout });

    const exitPromise = new Promise<void>((resolve, reject) => {
      child.on('error', error => {
        const reason = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to start Gemini CLI (${this.binary}): ${reason}`));
      });
      child.on('close', code => {
        const exitCode = typeof code === 'number' ? code.toString() : 'unknown';
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Gemini CLI exited with code ${exitCode}`));
        }
      });
    });

    try {
      for await (const line of rl) {
        if (typeof line !== 'string') {
          continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        let event: StreamEvent;
        try {
          event = JSON.parse(trimmed) as StreamEvent;
        } catch (error) {
          console.warn('[Gemini CLI] Failed to parse stream event:', trimmed, error);
          continue;
        }

        switch (event.type) {
          case 'init':
            if (event.session_id) {
              resolvedSessionId = event.session_id;
            }
            break;
          case 'message':
            if (event.role === 'assistant' && event.content) {
              yield { type: 'assistant', content: event.content };
            }
            break;
          case 'tool_use': {
            const toolEvent = event;
            yield {
              type: 'tool',
              toolName: toolEvent.tool_name ?? toolEvent.tool_id ?? 'tool_use',
              toolInput: toolEvent.parameters ?? {},
            };
            break;
          }
          case 'tool_result': {
            const toolResult = event;
            yield {
              type: 'tool',
              toolName: toolResult.tool_name ?? toolResult.tool_id ?? 'tool_result',
              toolInput: {
                status: toolResult.status,
                output: toolResult.output,
              },
            };
            break;
          }
          case 'error': {
            const errEvent = event;
            yield {
              type: 'system',
              content: `⚠️ Gemini CLI: ${errEvent.message ?? 'Unknown error'}`,
            };
            break;
          }
          case 'result':
            sawResult = true;
            break;
          default:
            break;
        }
      }

      await exitPromise;
    } finally {
      rl.close();
    }

    if (resolvedSessionId && sawResult) {
      yield { type: 'result', sessionId: resolvedSessionId };
    } else if (resolvedSessionId) {
      yield { type: 'result', sessionId: resolvedSessionId };
    }
  }
}
