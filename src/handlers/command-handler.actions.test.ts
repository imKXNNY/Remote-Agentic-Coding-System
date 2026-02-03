import { handleCommand } from './command-handler';
import { Conversation } from '../types';

jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises');
  return {
    ...actual,
    access: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../db/conversations', () => ({
  updateConversation: jest.fn(),
}));

jest.mock('../db/codebases', () => ({
  getCodebase: jest.fn(),
  updateCodebaseSandboxMode: jest.fn(),
  findBestCodebaseForPath: jest.fn(),
}));

jest.mock('../db/sessions', () => ({
  getActiveSession: jest.fn(),
  deactivateSession: jest.fn(),
  createSession: jest.fn(),
  updateSessionMetadata: jest.fn(),
}));

jest.mock('./codex-cli', () => ({
  runCodexReview: jest.fn(),
}));

jest.mock('../utils/bootstrap', () => ({
  runBootstrap: jest.fn(),
}));

jest.mock('../clients/factory', () => ({
  getAssistantClient: jest.fn(),
}));

import * as conversationsDb from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    platform_type: 'webui',
    platform_conversation_id: 'conv-ui',
    codebase_id: 'cb-default',
    cwd: '/workspace/Remote-Agentic-Coding-System',
    ai_assistant_type: 'codex',
    model_id: null,
    linked_issue: null,
    additional_dirs: [],
    last_bootstrap_at: null,
    bootstrap_status: 'pending',
    created_at: new Date('2026-02-03T00:00:00Z'),
    updated_at: new Date('2026-02-03T00:00:00Z'),
    ...overrides,
  };
}

describe('CommandHandler action commands', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('set-codebase switches conversation context and resets active session', async () => {
    const conversation = createConversation();
    (codebaseDb.getCodebase as jest.Mock).mockResolvedValue({
      id: 'cb-2',
      name: 'Webton-LeadPilot',
      default_cwd: '/workspace/Webton-LeadPilot',
      ai_assistant_type: 'codex',
    });
    (sessionDb.getActiveSession as jest.Mock).mockResolvedValue({ id: 'sess-1' });

    const result = await handleCommand(conversation, '/set-codebase cb-2');

    expect(conversationsDb.updateConversation).toHaveBeenCalledWith('conv-1', {
      codebase_id: 'cb-2',
      cwd: '/workspace/Webton-LeadPilot',
      ai_assistant_type: 'codex',
      additional_dirs: [],
      bootstrap_status: 'pending',
    });
    expect(sessionDb.deactivateSession).toHaveBeenCalledWith('sess-1');
    expect(result.success).toBe(true);
    expect(result.modified).toBe(true);
  });

  test('context link-issue persists linked issue at conversation level', async () => {
    const conversation = createConversation();
    (sessionDb.getActiveSession as jest.Mock).mockResolvedValue(null);

    const result = await handleCommand(
      conversation,
      '/context link-issue imKXNNY/Remote-Agentic-Coding-System#13 "WebUI parity"'
    );

    expect(conversationsDb.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        linked_issue: expect.objectContaining({
          owner: 'imKXNNY',
          repo: 'Remote-Agentic-Coding-System',
          number: 13,
          title: 'WebUI parity',
        }),
      })
    );
    expect(sessionDb.updateSessionMetadata).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  test('context clear clears conversation and active session metadata', async () => {
    const conversation = createConversation();
    (sessionDb.getActiveSession as jest.Mock).mockResolvedValue({ id: 'sess-1' });

    const result = await handleCommand(conversation, '/context clear');

    expect(conversationsDb.updateConversation).toHaveBeenCalledWith('conv-1', {
      linked_issue: null,
    });
    expect(sessionDb.updateSessionMetadata).toHaveBeenCalledWith('sess-1', { linkedIssue: null });
    expect(result.success).toBe(true);
  });

  test('codex-add-dir rejects adding current working directory as extra dir', async () => {
    const conversation = createConversation({
      cwd: '/workspace/Webton-LeadPilot',
      additional_dirs: [],
    });
    (sessionDb.getActiveSession as jest.Mock).mockResolvedValue(null);

    const result = await handleCommand(conversation, '/codex-add-dir Webton-LeadPilot');

    expect(result.success).toBe(true);
    expect(result.message).toContain('already the main working directory');
    expect(conversationsDb.updateConversation).not.toHaveBeenCalled();
  });
});
