/**
 * Codex SDK wrapper
 * Provides async generator interface for streaming Codex responses
 */
import { IAssistantClient, MessageChunk } from '../types';

// Type definition for Codex SDK (ESM import)
type CodexSDK = typeof import('@openai/codex-sdk');
type Codex = InstanceType<CodexSDK['Codex']>;

// Singleton Codex instance
let codexInstance: Codex | null = null;
let codexClass: CodexSDK['Codex'] | null = null;

// Dynamic import that bypasses TypeScript transpilation
// This prevents TS from converting import() to require() when module=commonjs
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importDynamic = new Function('modulePath', 'return import(modulePath)');

/**
 * Get or create Codex SDK instance (uses dynamic import for ESM compatibility)
 */
async function getCodex(): Promise<Codex> {
  if (!codexInstance) {
    if (!codexClass) {
      // Dynamic import to handle ESM-only package (bypasses TS transpilation)
      // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-call
      const { Codex: ImportedCodex } = await importDynamic('@openai/codex-sdk') as CodexSDK;
      codexClass = ImportedCodex;
    }
     
    codexInstance = new codexClass();
  }
  return codexInstance;
}

/**
 * Codex AI assistant client
 * Implements generic IAssistantClient interface
 */
export class CodexClient implements IAssistantClient {
  /**
   * Send a query to Codex and stream responses
   * @param prompt - User message or prompt
   * @param cwd - Working directory for Codex
   * @param resumeSessionId - Optional thread ID to resume
   * @param attachments - Optional list of file paths to attach
   */
   async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string,
    attachments?: string[],
    options?: { model?: string; sandbox?: string; outputFormat?: 'text' | 'json' }
  ): AsyncGenerator<MessageChunk> {
    // Check for JSON output mode
    if (options?.outputFormat === 'json') {
      yield* this.runJsonExec(prompt, cwd, attachments, options.model);
      return;
    }

    // Check for attachments - use CLI fallback if present
    if (attachments && attachments.length > 0) {
      yield* this.runWithCli(prompt, cwd, attachments, resumeSessionId);
      return;
    }

    const codex = await getCodex();

    // Get or create thread
    let thread;
    if (resumeSessionId) {
      console.log(`[Codex] Resuming thread: ${resumeSessionId}`);
      try {
        thread = codex.resumeThread(resumeSessionId, {
          workingDirectory: cwd,
          skipGitRepoCheck: true,
          model: options?.model,
        });
      } catch (error) {
        console.error(`[Codex] Failed to resume thread ${resumeSessionId}, creating new one:`, error);
        thread = codex.startThread({
          workingDirectory: cwd,
          skipGitRepoCheck: true,
          model: options?.model,
          sandboxMode: options?.sandbox as 'read-only' | 'workspace-write' | 'danger-full-access',
        });
      }
    } else {
      console.log(`[Codex] Starting new thread in ${cwd} (Model: ${options?.model || 'default'}, Sandbox: ${options?.sandbox || 'default'})`);
      thread = codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        model: options?.model,
        sandboxMode: options?.sandbox as 'read-only' | 'workspace-write' | 'danger-full-access',
      });
    }

    try {
      // Run streamed query (this IS async)
      const result = await thread.runStreamed(prompt);

      // Process streaming events
      for await (const event of result.events) {
        // Handle error events
        if (event.type === 'error') {
          console.error('[Codex] Stream error:', event.message);
          // Don't send MCP timeout errors (they're optional)
          if (!event.message.includes('MCP client')) {
            yield { type: 'system', content: `⚠️ ${event.message}` };
          }
          continue;
        }

        // Handle turn failed events
        if (event.type === 'turn.failed') {
          console.error('[Codex] Turn failed:', event.error?.message);
          yield {
            type: 'system',
            content: `❌ Turn failed: ${event.error?.message || 'Unknown error'}`,
          };
          break;
        }

        // Handle item.completed events - map to MessageChunk types
        if (event.type === 'item.completed') {
          const item = event.item;

          switch (item.type) {
            case 'agent_message':
              // Agent text response
              if (item.text) {
                yield { type: 'assistant', content: item.text };
              }
              break;

            case 'command_execution':
              // Tool/command execution
              if (item.command) {
                yield { type: 'tool', toolName: item.command };
              }
              break;

            case 'reasoning':
              // Agent reasoning/thinking
              if (item.text) {
                yield { type: 'thinking', content: item.text };
              }
              break;

            // Other item types are ignored (like file edits, etc.)
          }
        }

        // Handle turn.completed event
        if (event.type === 'turn.completed') {
          console.log('[Codex] Turn completed');
          // Yield result with thread ID for persistence
          yield { type: 'result', sessionId: thread.id || undefined };
          // CRITICAL: Break out of event loop - turn is complete!
          // Without this, the loop waits for stream to end (causes 90s timeout)
          break;
        }
      }
    } catch (error) {
      console.error('[Codex] Query error:', error);
      throw new Error(`Codex query failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run Codex CLI with --json for automated tasks
   */
  private async *runJsonExec(
    prompt: string,
    cwd: string,
    attachments: string[] = [],
    model?: string
  ): AsyncGenerator<MessageChunk> {
    const { spawn } = await import('child_process');
    
    console.log('[Codex] Running CLI in JSON mode');
    
    const args = ['exec', prompt, '--json'];
    if (model) args.push('--model', model);
    for (const att of attachments) {
      args.push('-i', att);
    }

    const child = spawn('codex', args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let buffer = '';
    
    // Process JSONL line by line
    if (child.stdout) {
      for await (const chunk of child.stdout as unknown as AsyncIterable<Buffer>) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
  
        for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as {
            type: string;
            text?: string;
            name?: string;
            command?: string;
            input?: Record<string, unknown>;
          };
          // Map JSON events to MessageChunks
          if (data.type === 'assistant_message' && data.text) {
             yield { type: 'assistant', content: data.text };
          } else if (data.type === 'tool_use' || data.type === 'command_execution') {
             yield { type: 'tool', toolName: data.name || data.command, toolInput: data.input };
          } else if (data.type === 'reasoning' && data.text) {
             yield { type: 'thinking', content: data.text };
          }
        } catch (_e) {
          // If not valid JSON, maybe it's just raw output
          yield { type: 'assistant', content: line };
        }
      }
    }
  }

    const code = await new Promise<number>((resolve) => {
      child.on('close', resolve);
    });

    if (code !== 0) {
      yield { type: 'system', content: '⚠️ Codex JSON execution failed.' };
    }
  }

  /**
   * Run Codex CLI for image inputs (SDK fallback)
   */
  private async *runWithCli(
    prompt: string,
    cwd: string,
    attachments: string[],
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk> {
    const { spawn } = await import('child_process');
    
    console.log(`[Codex] Running CLI with ${attachments.length} attachments`);
    
    // Construct args: codex exec "prompt" -i path1 -i path2
    const args = ['exec', prompt];
    for (const att of attachments) {
      args.push('-i', att); 
    }
    
    // Attempt to pass session context if possible (CLI dependent)
    if (resumeSessionId) {
       // args.push('--thread', resumeSessionId); // Hypothetical
    }

    const child = spawn('codex', args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // We could try to stream yield here if possible, but CLI might buffer
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      console.error(`[Codex CLI stderr]: ${data.toString()}`);
    });

    // Wait for completion
    // Wrapping in promise to await inside generator
    const code = await new Promise<number>((resolve) => {
      child.on('close', resolve);
    });

    if (code !== 0) {
       yield { type: 'system', content: `⚠️ Codex CLI failed: ${stderr}` };
    } else {
       yield { type: 'assistant', content: stdout || 'analysis complete.' };
    }
  }

  /**
   * Get the assistant type identifier
   */
  getType(): string {
    return 'codex';
  }
}
