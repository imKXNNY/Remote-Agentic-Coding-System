import type { Request, Response } from 'express';
import { postOpenClawBridgeHandler } from './openclaw';
import {
  finalizeWebhookRun,
  getWebhookMetrics,
  intakeWebhookRun,
  listRecentWebhookRuns,
  registerWebhookFailure,
} from '../db/webhook-control-plane';

jest.mock('../db/webhook-control-plane', () => ({
  intakeWebhookRun: jest.fn(),
  getWebhookMetrics: jest.fn(),
  listRecentWebhookRuns: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENCLAW_BRIDGE_SHARED_SECRET = 'secret-123';
    process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS = '/status';
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
    expect(finalizeWebhookRun).toHaveBeenCalledWith('run-1', 'executed', 'openclaw_status_report');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'executed',
        eventId: 'evt-1',
        runId: 'run-1',
        chainId: 'chain-1',
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
        command: '/execute dangerous',
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
});
