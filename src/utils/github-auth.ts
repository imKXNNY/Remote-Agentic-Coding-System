export type GitHubTokenSource = 'GITHUB_TOKEN' | 'GH_TOKEN' | 'none';
export type GitHubTokenState = 'present' | 'missing' | 'malformed';

export interface GitHubAuthPreflight {
  ready: boolean;
  source: GitHubTokenSource;
  token: string | null;
  tokenState: GitHubTokenState;
  tokenLength: number;
  hasGITHUB_TOKEN: boolean;
  hasGH_TOKEN: boolean;
  reason?: string;
}

export interface GitHubAuthErrorPayload {
  error: string;
  code: 'GITHUB_AUTH_UNAVAILABLE' | 'GITHUB_AUTH_FAILED';
  details: {
    reason: string;
    source: GitHubTokenSource;
    hasGITHUB_TOKEN: boolean;
    hasGH_TOKEN: boolean;
    hint: string;
  };
}

const MIN_TOKEN_LENGTH = 20;

function normalizeToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isMalformedToken(token: string): boolean {
  return token.length < MIN_TOKEN_LENGTH;
}

export function maskToken(token: string | null): string {
  if (!token) return '<missing>';
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function getGitHubAuthPreflight(env: NodeJS.ProcessEnv = process.env): GitHubAuthPreflight {
  const githubToken = normalizeToken(env.GITHUB_TOKEN);
  const ghToken = normalizeToken(env.GH_TOKEN);
  const token = githubToken ?? ghToken;
  const source: GitHubTokenSource = githubToken ? 'GITHUB_TOKEN' : ghToken ? 'GH_TOKEN' : 'none';

  if (!token) {
    return {
      ready: false,
      source,
      token: null,
      tokenState: 'missing',
      tokenLength: 0,
      hasGITHUB_TOKEN: Boolean(githubToken),
      hasGH_TOKEN: Boolean(ghToken),
      reason: 'Missing GitHub token env vars',
    };
  }

  if (isMalformedToken(token)) {
    return {
      ready: false,
      source,
      token,
      tokenState: 'malformed',
      tokenLength: token.length,
      hasGITHUB_TOKEN: Boolean(githubToken),
      hasGH_TOKEN: Boolean(ghToken),
      reason: 'Token appears malformed (too short)',
    };
  }

  return {
    ready: true,
    source,
    token,
    tokenState: 'present',
    tokenLength: token.length,
    hasGITHUB_TOKEN: Boolean(githubToken),
    hasGH_TOKEN: Boolean(ghToken),
  };
}

export function createAuthUnavailablePayload(preflight: GitHubAuthPreflight): GitHubAuthErrorPayload {
  return {
    error: 'GitHub authentication is not configured',
    code: 'GITHUB_AUTH_UNAVAILABLE',
    details: {
      reason: preflight.reason ?? 'Missing token',
      source: preflight.source,
      hasGITHUB_TOKEN: preflight.hasGITHUB_TOKEN,
      hasGH_TOKEN: preflight.hasGH_TOKEN,
      hint: 'Set GH_TOKEN or GITHUB_TOKEN in .env and restart the service.',
    },
  };
}

export function createAuthFailedPayload(preflight: GitHubAuthPreflight): GitHubAuthErrorPayload {
  return {
    error: 'GitHub authentication failed for this request',
    code: 'GITHUB_AUTH_FAILED',
    details: {
      reason: 'GitHub API rejected credentials or token scopes for this operation',
      source: preflight.source,
      hasGITHUB_TOKEN: preflight.hasGITHUB_TOKEN,
      hasGH_TOKEN: preflight.hasGH_TOKEN,
      hint: 'Verify token validity/scopes (repo, read:org if org metadata is required), then restart the service.',
    },
  };
}

export function getGitHubApiErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}
