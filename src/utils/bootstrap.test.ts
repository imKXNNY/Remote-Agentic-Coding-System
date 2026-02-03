import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { runBootstrap } from './bootstrap';
import { Codebase, Conversation, IAssistantClient, MessageChunk } from '../types';
import * as db from '../db/conversations';

jest.mock('../db/conversations', () => ({
  updateConversation: jest.fn(),
}));

function createConversation(cwd: string): Conversation {
  const now = new Date();
  return {
    id: 'conv-1',
    platform_type: 'webui',
    platform_conversation_id: 'platform-conv-1',
    codebase_id: 'codebase-1',
    cwd,
    ai_assistant_type: 'codex',
    model_id: null,
    additional_dirs: null,
    linked_issue: null,
    last_bootstrap_at: null,
    bootstrap_status: 'pending',
    created_at: now,
    updated_at: now,
  };
}

function createCodebase(cwd: string): Codebase {
  const now = new Date();
  return {
    id: 'codebase-1',
    name: 'test-repo',
    repository_url: null,
    default_cwd: cwd,
    ai_assistant_type: 'codex',
    sandbox_mode: 'workspace-write',
    commands: {},
    created_at: now,
    updated_at: now,
  };
}

async function* asStream(chunks: MessageChunk[]): AsyncGenerator<MessageChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('runBootstrap marker parsing', () => {
  let tempDir: string;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'bootstrap-test-'));
    await writeFile(join(tempDir, 'package.json'), '{"name":"x"}', 'utf8');
    await writeFile(join(tempDir, 'package-lock.json'), '{"lockfileVersion":3}', 'utf8');
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('marks bootstrap success when explicit success marker is present', async () => {
    const aiClient: IAssistantClient = {
      sendQuery: jest.fn(() =>
        asStream([
          { type: 'assistant', content: 'Running npm ci...' },
          { type: 'assistant', content: 'BOOTSTRAP_RESULT: success' },
        ])
      ),
      getType: () => 'codex',
    };

    const result = await runBootstrap(createConversation(tempDir), createCodebase(tempDir), aiClient, true);

    expect(result.status).toBe('success');
    expect(db.updateConversation).toHaveBeenCalledWith('conv-1', { bootstrap_status: 'running' });
    expect(db.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ bootstrap_status: 'success', last_bootstrap_at: expect.any(Date) })
    );
  });

  it('marks bootstrap failed when explicit marker is missing', async () => {
    const aiClient: IAssistantClient = {
      sendQuery: jest.fn(() =>
        asStream([{ type: 'assistant', content: 'npm ci complete. all dependencies installed.' }])
      ),
      getType: () => 'codex',
    };

    const result = await runBootstrap(createConversation(tempDir), createCodebase(tempDir), aiClient, true);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('BOOTSTRAP_RESULT: success');
    expect(db.updateConversation).toHaveBeenCalledWith('conv-1', { bootstrap_status: 'failed' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without BOOTSTRAP_RESULT marker'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('output_sha256_prefix='));
  });

  it('marks bootstrap failed when explicit failed marker is present', async () => {
    const aiClient: IAssistantClient = {
      sendQuery: jest.fn(() =>
        asStream([{ type: 'assistant', content: 'BOOTSTRAP_RESULT: failed\nnpm ci returned non-zero exit code' }])
      ),
      getType: () => 'codex',
    };

    const result = await runBootstrap(createConversation(tempDir), createCodebase(tempDir), aiClient, true);

    expect(result.status).toBe('failed');
    expect(db.updateConversation).toHaveBeenCalledWith('conv-1', { bootstrap_status: 'failed' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Setup reported explicit failure marker'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('output_sha256_prefix='));
  });

  it('uses the last marker when multiple BOOTSTRAP_RESULT markers are present', async () => {
    const aiClient: IAssistantClient = {
      sendQuery: jest.fn(() =>
        asStream([
          { type: 'assistant', content: 'BOOTSTRAP_RESULT: success' },
          { type: 'assistant', content: '... continuing checks ... BOOTSTRAP_RESULT: failed' },
        ])
      ),
      getType: () => 'codex',
    };

    const result = await runBootstrap(createConversation(tempDir), createCodebase(tempDir), aiClient, true);

    expect(result.status).toBe('failed');
    expect(db.updateConversation).toHaveBeenCalledWith('conv-1', { bootstrap_status: 'failed' });
  });
});
