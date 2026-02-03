import { Router } from 'express';
import { Octokit } from '@octokit/rest';
import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import {
  createAuthFailedPayload,
  createAuthUnavailablePayload,
  getGitHubApiErrorStatus,
  getGitHubAuthPreflight,
} from '../utils/github-auth';
import { listRecentWebhookRuns } from '../db/webhook-control-plane';

const router = Router();

/**
 * GET /api/github/issues
 * Fetch open issues for a repository
 * Query params: owner, repo
 */
export async function getGithubIssuesHandler(req: Request, res: Response): Promise<void> {
  const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
  const repo = typeof req.query.repo === 'string' ? req.query.repo : undefined;

  if (!owner || !repo) {
    res.status(400).json({ error: 'Missing owner or repo query parameters' });
    return;
  }

  const preflight = getGitHubAuthPreflight();
  if (!preflight.ready || !preflight.token) {
    console.warn('[API] GitHub auth unavailable for /api/github/issues', {
      reason: preflight.reason,
      source: preflight.source,
      hasGITHUB_TOKEN: preflight.hasGITHUB_TOKEN,
      hasGH_TOKEN: preflight.hasGH_TOKEN,
    });
    res.status(503).json(createAuthUnavailablePayload(preflight));
    return;
  }

  const octokit = new Octokit({
    auth: preflight.token,
  });

  try {
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 50, // Limit to 50 for now
      sort: 'updated',
      direction: 'desc'
    });

    // Simplify response payload
    const issues = data.map(issue => ({
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      user: {
        login: issue.user?.login
      },
      labels: issue.labels.map(L => typeof L === 'string' ? L : L.name),
      is_pull_request: !!issue.pull_request
    }));

    // Filter out PRs if desired, but "issues" API returns both by default in GitHub
    // We might want to separate them or show badges. 
    // For "Connect to Issue" context, standard issues are usually what we want (triage etc).
    const onlyIssues = issues.filter(i => !i.is_pull_request);

    res.json(onlyIssues);
    return;
  } catch (error) {
    const status = getGitHubApiErrorStatus(error);
    if (status === 401 || status === 403) {
      console.warn('[API] GitHub auth failed for /api/github/issues', {
        status,
        source: preflight.source,
      });
      res.status(502).json(createAuthFailedPayload(preflight));
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[API] Failed to fetch GitHub issues:', message);
    res.status(500).json({ error: 'Failed to fetch issues from GitHub', code: 'GITHUB_API_ERROR' });
    return;
  }
}

router.get('/github/issues', asyncHandler(getGithubIssuesHandler));

/**
 * GET /api/github/webhook-runs
 * Returns latest webhook control-plane runs for audit/debug.
 * Query params: limit (optional, 1..200)
 */
export async function getGithubWebhookRunsHandler(req: Request, res: Response): Promise<void> {
  const parsedLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
  const rows = await listRecentWebhookRuns(limit);
  res.json(rows);
}

router.get('/github/webhook-runs', asyncHandler(getGithubWebhookRunsHandler));

export default router;
