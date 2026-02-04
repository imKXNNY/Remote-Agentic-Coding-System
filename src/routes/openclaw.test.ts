import type { Request, Response } from 'express';
import { postOpenClawBridgeHandler } from './openclaw';
import {
  finalizeWebhookRun,
  getWebhookMetrics,
  intakeWebhookRun,
  listRecentWebhookRuns,
  listWebhookRunEvents,
  registerWebhookFailure,
} from '../db/webhook-control-plane';

jest.mock('../db/webhook-control-plane', () => ({
  intakeWebhookRun: jest.fn(),
  getWebhookMetrics: jest.fn(),
  listRecentWebhookRuns: jest.fn(),
  listWebhookRunEvents: jest.fn(),
  finalizeWebhookRun: jest.fn(),
  registerWebhookFailure: jest.fn(),
}));

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createResponse(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('openclaw bridge route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENCLAW_BRIDGE_SHARED_SECRET = 'secret-123';
    process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS = '/status,/metrics,/runs,/events';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('rejects requests with invalid secret', async () => {
    const req = {
      body: {},
      header: jest.fn().mockReturnValue('wrong-secret'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('executes /status command with run observability ids', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'accepted',
      chain: { id: 'chain-1' },
      run: { id: 'run-1' },
    });
    (getWebhookMetrics as unknown as jest.Mock).mockResolvedValueOnce({
      totals: {
        totalRuns: 5,
        executedRuns: 4,
        blockedRuns: 1,
        approvalRequiredRuns: 0,
      },
    });
    (listRecentWebhookRuns as unknown as jest.Mock).mockResolvedValueOnce([
      { id: 'run-a', status: 'executed', reason: null, created_at: new Date('2026-02-04T00:00:00Z') },
    ]);

    const req = {
      body: {
        eventId: 'evt-1',
        conversationId: 'openclaw:thread-1',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        targetBranch: 'stable',
        command: '/status',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(intakeWebhookRun).toHaveBeenCalled();
    expect(getWebhookMetrics).toHaveBeenCalledWith('openclaw');
    expect(listRecentWebhookRuns).toHaveBeenCalledWith({
      limit: 5,
      platformType: 'openclaw',
    });
    expect(finalizeWebhookRun).toHaveBeenCalledWith('run-1', 'executed', 'openclaw_command_executed');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'executed',
        eventId: 'evt-1',
        runId: 'run-1',
        chainId: 'chain-1',
        command: '/status',
      })
    );
  });

  test('executes /metrics command', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'accepted',
      chain: { id: 'chain-m' },
      run: { id: 'run-m' },
    });
    (getWebhookMetrics as unknown as jest.Mock).mockResolvedValueOnce({
      totals: {
        totalRuns: 11,
        executedRuns: 9,
        blockedRuns: 1,
        approvalRequiredRuns: 1,
      },
      statusCounts: { executed: 9 },
      durationSeconds: { avg: 2, p95: 4 },
    });

    const req = {
      body: {
        eventId: 'evt-metrics',
        conversationId: 'openclaw:metrics',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        command: '/metrics',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(getWebhookMetrics).toHaveBeenCalledWith('openclaw');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'executed',
        command: '/metrics',
      })
    );
  });

  test('executes /events command and returns redacted-safe subset', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'accepted',
      chain: { id: 'chain-e' },
      run: { id: 'run-e' },
    });
    (listWebhookRunEvents as unknown as jest.Mock).mockResolvedValueOnce([
      {
        id: 'evt-raw-1',
        event_type: 'run_created',
        status: 'accepted',
        message: 'created',
        metadata: { token: 'secret' },
        created_at: new Date('2026-02-04T00:00:00Z'),
      },
    ]);

    const req = {
      body: {
        eventId: 'evt-events',
        conversationId: 'openclaw:events',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        command: '/events run-abc 30',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(listWebhookRunEvents).toHaveBeenCalledWith('run-abc', 30);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        result: [
          expect.not.objectContaining({
            metadata: expect.anything(),
          }),
        ],
      })
    );
  });

  test('returns 400 when /events is missing required runId argument', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'accepted',
      chain: { id: 'chain-e2' },
      run: { id: 'run-e2' },
    });

    const req = {
      body: {
        eventId: 'evt-events-missing-runid',
        conversationId: 'openclaw:events-missing',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        command: '/events',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(finalizeWebhookRun).toHaveBeenCalledWith('run-e2', 'paused', 'command_not_allowed');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'invalid_command_arguments',
        error: 'invalid_command_arguments',
      })
    );
  });

  test('blocks disallowed command and returns policy reason', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'blocked',
      chain: { id: 'chain-2' },
      run: { id: 'run-2', reason: 'command_not_allowed' },
      reason: 'command_not_allowed',
    });

    const req = {
      body: {
        eventId: 'evt-2',
        conversationId: 'openclaw:thread-2',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        command: '/unknown dangerous',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'blocked_policy',
        reason: 'command_not_allowed',
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({
        allowedCommands: expect.any(Array),
      })
    );
  });

  test('handles replay/in-flight dedupe responses', async () => {
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'replay_inflight',
      chain: { id: 'chain-3' },
      run: { id: 'run-3' },
    });

    const req = {
      body: {
        eventId: 'evt-3',
        conversationId: 'openclaw:thread-3',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        command: '/status',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'already_processing',
        runId: 'run-3',
      })
    );
    expect(registerWebhookFailure).not.toHaveBeenCalled();
  });

  test('returns unsupported_command when command is allowlisted but not implemented', async () => {
    process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS = '/status,/execute';
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'accepted',
      chain: { id: 'chain-4' },
      run: { id: 'run-4' },
    });

    const req = {
      body: {
        eventId: 'evt-4',
        conversationId: 'openclaw:thread-4',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        targetBranch: 'feature/openclaw-v2',
        command: '/execute',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(registerWebhookFailure).toHaveBeenCalledWith(
      'chain-4',
      'run-4',
      expect.stringContaining('allowlisted but not implemented')
    );
    expect(finalizeWebhookRun).toHaveBeenCalledWith(
      'run-4',
      'paused',
      'command_not_allowed'
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unsupported_command',
        error: 'unsupported_command',
      })
    );
  });

  test('marks mutating capability commands as requiring approval on stable branch', async () => {
    process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS = '/status,/execute';
    (intakeWebhookRun as unknown as jest.Mock).mockResolvedValueOnce({
      decision: 'requires_approval',
      chain: { id: 'chain-5' },
      run: { id: 'run-5', reason: 'branch_not_allowed' },
      reason: 'branch_not_allowed',
    });

    const req = {
      body: {
        eventId: 'evt-5',
        conversationId: 'openclaw:thread-5',
        repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
        targetBranch: 'stable',
        command: '/execute update something',
      },
      header: jest.fn().mockReturnValue('secret-123'),
    } as unknown as Request;
    const res = createResponse();

    await postOpenClawBridgeHandler(req, res);

    expect(intakeWebhookRun).toHaveBeenCalledWith(
      expect.objectContaining({
        action: '/execute',
        isMutating: true,
        policyDecision: 'requires_approval',
      })
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'requires_approval',
      })
    );
  });
});
