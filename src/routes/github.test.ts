import type { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import { getGithubIssuesHandler } from './github';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
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
