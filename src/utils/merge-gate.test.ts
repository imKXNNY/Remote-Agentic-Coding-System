import {
  evaluateMergeGate,
  normalizeCheckRunConclusion,
  normalizeCombinedStatusState,
  parseRequiredMergeChecks,
} from './merge-gate';

describe('merge-gate utils', () => {
  test('allows merge when all constraints are satisfied', () => {
    const result = evaluateMergeGate({
      pullRequestState: 'open',
      mergeable: true,
      mergeableState: 'clean',
      requiredChecks: ['ci / test', 'lint'],
      observedChecks: [
        { name: 'ci / test', status: 'success' },
        { name: 'lint', status: 'success' },
      ],
      reviews: [{ author: 'alice', state: 'APPROVED' }],
    });

    expect(result.decision).toBe('allow');
    expect(result.denyReasons).toEqual([]);
  });

  test('denies merge for pending and failed checks', () => {
    const result = evaluateMergeGate({
      pullRequestState: 'open',
      mergeable: true,
      mergeableState: 'clean',
      requiredChecks: ['ci', 'lint'],
      observedChecks: [
        { name: 'ci', status: 'pending' },
        { name: 'lint', status: 'failure' },
      ],
      reviews: [],
    });

    expect(result.decision).toBe('deny');
    expect(result.denyReasons).toEqual(expect.arrayContaining(['checks_pending', 'checks_failed']));
    expect(result.pendingChecks).toEqual(['ci']);
    expect(result.failedChecks).toEqual(['lint']);
  });

  test('denies merge when branch is behind and review changes requested', () => {
    const result = evaluateMergeGate({
      pullRequestState: 'open',
      mergeable: true,
      mergeableState: 'behind',
      requiredChecks: ['ci'],
      observedChecks: [{ name: 'ci', status: 'success' }],
      reviews: [
        { author: 'alice', state: 'APPROVED' },
        { author: 'bob', state: 'CHANGES_REQUESTED' },
      ],
    });

    expect(result.decision).toBe('deny');
    expect(result.denyReasons).toEqual(expect.arrayContaining(['branch_not_up_to_date', 'review_changes_requested']));
    expect(result.blockingReviewers).toEqual(['bob']);
  });

  test('supports required check parsing', () => {
    expect(parseRequiredMergeChecks(' ci , lint,ci ')).toEqual(['ci', 'lint']);
    expect(parseRequiredMergeChecks(undefined)).toEqual([]);
  });

  test('normalizes status/check-run states', () => {
    expect(normalizeCombinedStatusState('success')).toBe('success');
    expect(normalizeCombinedStatusState('pending')).toBe('pending');
    expect(normalizeCombinedStatusState('failure')).toBe('failure');

    expect(normalizeCheckRunConclusion('queued', null)).toBe('pending');
    expect(normalizeCheckRunConclusion('completed', 'success')).toBe('success');
    expect(normalizeCheckRunConclusion('completed', 'neutral')).toBe('success');
    expect(normalizeCheckRunConclusion('completed', 'failure')).toBe('failure');
  });
});
