import type { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import {
  getGithubIssuesHandler,
  getGithubWebhookMetricsHandler,
  getGithubWebhookRunEventsHandler,
  getGithubWebhookRunsHandler,
} from './github';
import { getWebhookMetrics, listRecentWebhookRuns, listWebhookRunEvents } from '../db/webhook-control-plane';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));
jest.mock('../db/webhook-control-plane', () => ({
  listRecentWebhookRuns: jest.fn().mockResolvedValue([]),
  listWebhookRunEvents: jest.fn().mockResolvedValue([]),
  getWebhookMetrics: jest.fn().mockResolvedValue({ totals: { totalRuns: 0 }, statusCounts: {}, durationSeconds: { avg: 0, p95: 0 } }),
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

function createRequest(owner = 'imKXNNY', repo = 'Remote-Agentic-Coding-System'): Request {
  return {
    query: { owner, repo },
  } as unknown as Request;
}

describe('github route auth diagnostics', () => {
  const originalEnv = process.env;
  let listForRepo: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    listForRepo = jest.fn();
    (Octokit as unknown as jest.Mock).mockImplementation(() => ({
      rest: {
        issues: {
          listForRepo,
        },
      },
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns 503 with deterministic payload when token is missing', async () => {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = createRequest();
    const res = createResponse();

    await getGithubIssuesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'GITHUB_AUTH_UNAVAILABLE',
      })
    );
    expect(Octokit).not.toHaveBeenCalled();
  });

  test('returns 400 when owner/repo query params are not strings', async () => {
    process.env.GH_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
    const req = {
      query: { owner: ['imKXNNY'], repo: 'Remote-Agentic-Coding-System' },
    } as unknown as Request;
    const res = createResponse();

    await getGithubIssuesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Octokit).not.toHaveBeenCalled();
  });

  test('returns issues on happy path and filters pull requests', async () => {
    process.env.GH_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
    listForRepo.mockResolvedValue({
      data: [
        {
          number: 1,
          title: 'Issue 1',
          html_url: 'https://github.com/example/repo/issues/1',
          state: 'open',
          user: { login: 'alice' },
          labels: [{ name: 'bug' }],
        },
        {
          number: 2,
          title: 'PR 2',
          html_url: 'https://github.com/example/repo/pull/2',
          state: 'open',
          user: { login: 'bob' },
          labels: [],
          pull_request: { url: 'https://api.github.com/repos/example/repo/pulls/2' },
        },
      ],
    });

    const req = createRequest();
    const res = createResponse();

    await getGithubIssuesHandler(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        number: 1,
        title: 'Issue 1',
        is_pull_request: false,
      }),
    ]);
  });

  test('returns 502 when GitHub rejects credentials', async () => {
    process.env.GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
    listForRepo.mockRejectedValue({ status: 401, message: 'Bad credentials' });

    const req = createRequest();
    const res = createResponse();

    await getGithubIssuesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'GITHUB_AUTH_FAILED',
      })
    );
  });
});

describe('github webhook runs route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns latest webhook runs with default filter payload', async () => {
    (listRecentWebhookRuns as unknown as jest.Mock).mockResolvedValueOnce([{ id: 'run-1' }]);
    const req = { query: {} } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith({
      limit: 50,
      platformType: undefined,
      status: undefined,
      chainId: undefined,
      runId: undefined,
      search: undefined,
      windowHours: undefined,
    });
    expect(res.json).toHaveBeenCalledWith([{ id: 'run-1' }]);
  });

  test('supports explicit filters and limit', async () => {
    const req = { query: { limit: '10' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
      })
    );
  });

  test('defaults to 50 when limit is not numeric', async () => {
    const req = { query: { limit: 'abc' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
      })
    );
  });

  test('clamps limit to upper bound', async () => {
    const req = { query: { limit: '999' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 200,
      })
    );
  });

  test('forwards platform/status/window/search filters', async () => {
    const req = {
      query: {
        platform: 'github',
        status: 'executed',
        windowHours: '24',
        chainId: 'chain-1',
        runId: 'run-1',
        search: 'repo-name',
      },
    } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith({
      limit: 50,
      platformType: 'github',
      status: 'executed',
      chainId: 'chain-1',
      runId: 'run-1',
      search: 'repo-name',
      windowHours: 24,
    });
  });

  test('propagates query failures for async handler middleware', async () => {
    (listRecentWebhookRuns as unknown as jest.Mock).mockRejectedValueOnce(new Error('db unavailable'));
    const req = { query: {} } as unknown as Request;
    const res = createResponse();

    await expect(getGithubWebhookRunsHandler(req, res)).rejects.toThrow('db unavailable');
  });
});

describe('github webhook run events route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns run event timeline with redacted secrets', async () => {
    (listWebhookRunEvents as unknown as jest.Mock).mockResolvedValueOnce([
      {
        id: 'evt-1',
        event_type: 'run_created',
        message: 'using token ghp_abcdefghijklmnopqrstuvwxyz123',
        metadata: {
          nested: {
            authorization: 'Bearer abcdef1234567890',
          },
          safe: 'hello',
        },
      },
    ]);
    const req = { params: { runId: 'run-1' }, query: {} } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunEventsHandler(req, res);

    expect(listWebhookRunEvents).toHaveBeenCalledWith('run-1', 200);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'evt-1',
        event_type: 'run_created',
        message: expect.stringContaining('[REDACTED]'),
        metadata: expect.objectContaining({
          nested: expect.objectContaining({
            authorization: '[REDACTED]',
          }),
          safe: 'hello',
        }),
      }),
    ]);
  });

  test('returns 400 when runId missing', async () => {
    const req = { params: {}, query: {} } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunEventsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('github webhook metrics route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns webhook metrics payload', async () => {
    (getWebhookMetrics as unknown as jest.Mock).mockResolvedValueOnce({
      totals: { totalRuns: 5 },
      statusCounts: { executed: 3 },
      durationSeconds: { avg: 2.5, p95: 4.1 },
    });
    const req = {} as unknown as Request;
    const res = createResponse();

    await getGithubWebhookMetricsHandler(req, res);

    expect(getWebhookMetrics).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totals: expect.objectContaining({ totalRuns: 5 }),
      })
    );
  });
});
