import type { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import { getGithubIssuesHandler, getGithubWebhookRunsHandler } from './github';
import { listRecentWebhookRuns } from '../db/webhook-control-plane';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));
jest.mock('../db/webhook-control-plane', () => ({
  listRecentWebhookRuns: jest.fn().mockResolvedValue([]),
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

  test('returns latest webhook runs with default limit', async () => {
    (listRecentWebhookRuns as unknown as jest.Mock).mockResolvedValueOnce([{ id: 'run-1' }]);
    const req = { query: {} } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(50);
    expect(res.json).toHaveBeenCalledWith([{ id: 'run-1' }]);
  });

  test('supports explicit numeric limit', async () => {
    const req = { query: { limit: '10' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(10);
  });

  test('defaults to 50 when limit is not numeric', async () => {
    const req = { query: { limit: 'abc' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(50);
  });

  test('clamps limit to upper bound', async () => {
    const req = { query: { limit: '999' } } as unknown as Request;
    const res = createResponse();

    await getGithubWebhookRunsHandler(req, res);

    expect(listRecentWebhookRuns).toHaveBeenCalledWith(200);
  });

  test('propagates query failures for async handler middleware', async () => {
    (listRecentWebhookRuns as unknown as jest.Mock).mockRejectedValueOnce(new Error('db unavailable'));
    const req = { query: {} } as unknown as Request;
    const res = createResponse();

    await expect(getGithubWebhookRunsHandler(req, res)).rejects.toThrow('db unavailable');
  });
});
