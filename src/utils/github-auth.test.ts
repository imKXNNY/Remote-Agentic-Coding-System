import {
  createAuthFailedPayload,
  createAuthUnavailablePayload,
  getGitHubApiErrorStatus,
  getGitHubAuthPreflight,
  maskToken,
} from './github-auth';

describe('github-auth utility', () => {
  test('returns missing preflight when no token env is present', () => {
    const preflight = getGitHubAuthPreflight({});

    expect(preflight.ready).toBe(false);
    expect(preflight.tokenState).toBe('missing');
    expect(preflight.source).toBe('none');
  });

  test('prefers GITHUB_TOKEN over GH_TOKEN when both are set', () => {
    const preflight = getGitHubAuthPreflight({
      GITHUB_TOKEN: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      GH_TOKEN: 'ghp_override_should_not_be_used_1234567890',
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.source).toBe('GITHUB_TOKEN');
    expect(preflight.token).toBe('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
  });

  test('flags short token as malformed', () => {
    const preflight = getGitHubAuthPreflight({
      GH_TOKEN: 'ghp_short',
    });

    expect(preflight.ready).toBe(false);
    expect(preflight.tokenState).toBe('malformed');
  });

  test('masks token values', () => {
    expect(maskToken(null)).toBe('<missing>');
    expect(maskToken('ghp_abcdefghijklmnopqrstuvwxyz')).toBe('ghp_...wxyz');
  });

  test('builds deterministic auth error payloads', () => {
    const preflight = getGitHubAuthPreflight({});
    const unavailable = createAuthUnavailablePayload(preflight);
    const failed = createAuthFailedPayload({
      ...preflight,
      source: 'GH_TOKEN',
      hasGH_TOKEN: true,
      reason: 'scope missing',
    });

    expect(unavailable.code).toBe('GITHUB_AUTH_UNAVAILABLE');
    expect(failed.code).toBe('GITHUB_AUTH_FAILED');
    expect(unavailable.details.hint).toContain('GH_TOKEN');
    expect(failed.details.reason).toContain('rejected credentials');
  });

  test('extracts status from octokit-like errors', () => {
    expect(getGitHubApiErrorStatus({ status: 401 })).toBe(401);
    expect(getGitHubApiErrorStatus({ status: '401' })).toBeNull();
    expect(getGitHubApiErrorStatus(new Error('boom'))).toBeNull();
  });
});
