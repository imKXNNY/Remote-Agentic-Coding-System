import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { GeminiClient } from './gemini';
import type { MessageChunk } from '../types';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const spawnMock = spawn as unknown as jest.Mock;

describe('GeminiClient (CLI)', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  function createMockProcess() {
    const child = new EventEmitter() as unknown as {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      on: (event: string, listener: (...args: unknown[]) => void) => typeof listener;
    };
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.setEncoding('utf-8');
    stderr.setEncoding('utf-8');
    Object.assign(child, {
      stdout,
      stderr,
      stdin: new PassThrough(),
    });
    return { child: child as unknown as EventEmitter & { stdout: PassThrough; stderr: PassThrough }, stdout, stderr };
  }

  test('streams assistant, tool, and result events', async () => {
    const { child, stdout, stderr } = createMockProcess();
    spawnMock.mockReturnValue(child);

    const client = new GeminiClient();

    const collected: MessageChunk[] = [];
    const iterator = (async () => {
      for await (const chunk of client.sendQuery('hello', '/repo')) {
        collected.push(chunk);
      }
    })();

    stdout.write('{"type":"init","session_id":"session-123"}\n');
    stdout.write('{"type":"message","role":"assistant","content":"Hi there"}\n');
    stdout.write('{"type":"tool_use","tool_name":"bash","parameters":{"command":"ls"}}\n');
    stdout.write('{"type":"result","status":"success"}\n');
    stdout.end();
    child.emit('close', 0);
    stderr.end();

    await iterator;

    expect(collected).toEqual([
      { type: 'assistant', content: 'Hi there' },
      { type: 'tool', toolName: 'bash', toolInput: { command: 'ls' } },
      { type: 'result', sessionId: 'session-123' },
    ]);

    const spawnArgs = spawnMock.mock.calls[0][1];
    expect(spawnArgs).toContain('--output-format');
    expect(spawnArgs).toContain('stream-json');
    const promptArg = (spawnArgs as string[]).find(arg => arg.startsWith('--prompt='));
    expect(promptArg).toBe(`--prompt=hello`);
  });

  test('propagates CLI failures', async () => {
    const { child, stdout, stderr } = createMockProcess();
    spawnMock.mockReturnValue(child);

    const client = new GeminiClient();

    const consume = async () => {
      for await (const chunk of client.sendQuery('fail', '/repo')) {
        void chunk;
      }
    };

    const consumePromise = consume();
    stdout.end();
    stderr.end();
    child.emit('close', 1);

    await expect(consumePromise).rejects.toThrow(/Gemini CLI exited/);
  });

  test('passes --resume when session id provided', async () => {
    const { child, stdout, stderr } = createMockProcess();
    spawnMock.mockReturnValue(child);

    const client = new GeminiClient();
    const chunks: MessageChunk[] = [];
    const iterator = (async () => {
      for await (const chunk of client.sendQuery('again', '/repo', 'abc')) {
        chunks.push(chunk);
      }
    })();

    stdout.write('{"type":"result","status":"success"}\n');
    stdout.end();
    stderr.end();
    child.emit('close', 0);

    await iterator;

    const args = spawnMock.mock.calls[0][1] as string[];
    const resumeIndex = args.indexOf('--resume');
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(args[resumeIndex + 1]).toBe('abc');
  });
});
