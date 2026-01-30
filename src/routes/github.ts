import { Router } from 'express';
import { Octokit } from '@octokit/rest';

const router = Router();

// Initialize Octokit with the server's token
// This allows the WebUI to browse issues without forcing every user to provide a token
const octokit = new Octokit({ 
  auth: process.env.GITHUB_TOKEN || process.env.GH_TOKEN 
});

/**
 * GET /api/github/issues
 * Fetch open issues for a repository
 * Query params: owner, repo
 */
router.get('/github/issues', async (req, res) => {
  const owner = req.query.owner as string;
  const repo = req.query.repo as string;

  if (!owner || !repo) {
    return res.status(400).json({ error: 'Missing owner or repo query parameters' });
  }

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

    return res.json(onlyIssues);
  } catch (error: any) {
    console.error('[API] Failed to fetch GitHub issues:', error.message);
    return res.status(500).json({ error: 'Failed to fetch issues from GitHub' });
  }
});

export default router;
