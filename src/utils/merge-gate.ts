export type MergeGateDecision = 'allow' | 'deny';

export type MergeGateDenyReason =
  | 'pull_request_not_open'
  | 'mergeability_unknown'
  | 'merge_conflict'
  | 'branch_not_up_to_date'
  | 'merge_state_not_clean'
  | 'checks_missing'
  | 'checks_pending'
  | 'checks_failed'
  | 'review_changes_requested';

export interface MergeGateCheck {
  name: string;
  status: 'success' | 'pending' | 'failure';
  source?: 'status' | 'check_run';
}

export interface MergeGateReview {
  author: string;
  state: string;
}

export interface EvaluateMergeGateInput {
  pullRequestState: string;
  mergeable: boolean | null;
  mergeableState: string | null;
  requiredChecks: string[];
  observedChecks: MergeGateCheck[];
  reviews: MergeGateReview[];
}

export interface MergeGateEvaluation {
  decision: MergeGateDecision;
  denyReasons: MergeGateDenyReason[];
  missingRequiredChecks: string[];
  pendingChecks: string[];
  failedChecks: string[];
  blockingReviewers: string[];
}

const REVIEW_BLOCK_STATES = new Set(['CHANGES_REQUESTED', 'REQUEST_CHANGES']);

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function classifyMergeableState(
  mergeable: boolean | null,
  mergeableState: string | null
): MergeGateDenyReason[] {
  const normalizedState = (mergeableState ?? '').toLowerCase();
  const reasons: MergeGateDenyReason[] = [];

  if (mergeable === null || normalizedState === 'unknown') {
    reasons.push('mergeability_unknown');
    return reasons;
  }

  if (!mergeable || normalizedState === 'dirty') {
    reasons.push('merge_conflict');
    return reasons;
  }

  if (normalizedState === 'behind') {
    reasons.push('branch_not_up_to_date');
    return reasons;
  }

  if (normalizedState && normalizedState !== 'clean' && normalizedState !== 'has_hooks') {
    reasons.push('merge_state_not_clean');
  }

  return reasons;
}

function collectReviewBlockers(reviews: MergeGateReview[]): string[] {
  const latestStateByAuthor = new Map<string, string>();
  for (const review of reviews) {
    const author = review.author.trim();
    if (!author) {
      continue;
    }
    latestStateByAuthor.set(author, review.state.toUpperCase());
  }

  return uniqueSorted(
    [...latestStateByAuthor.entries()]
      .filter(([, state]) => REVIEW_BLOCK_STATES.has(state))
      .map(([author]) => author)
  );
}

function buildCheckStatusMap(checks: MergeGateCheck[]): Map<string, MergeGateCheck['status']> {
  const precedence: Record<MergeGateCheck['status'], number> = {
    success: 0,
    pending: 1,
    failure: 2,
  };

  const map = new Map<string, MergeGateCheck['status']>();
  for (const check of checks) {
    const name = normalizeName(check.name);
    if (!name) {
      continue;
    }
    const existing = map.get(name);
    if (!existing || precedence[check.status] > precedence[existing]) {
      map.set(name, check.status);
    }
  }
  return map;
}

export function evaluateMergeGate(input: EvaluateMergeGateInput): MergeGateEvaluation {
  const denyReasons: MergeGateDenyReason[] = [];

  if (input.pullRequestState.toLowerCase() !== 'open') {
    denyReasons.push('pull_request_not_open');
  }

  denyReasons.push(...classifyMergeableState(input.mergeable, input.mergeableState));

  const checkStatusMap = buildCheckStatusMap(input.observedChecks);
  const requiredCheckNames = uniqueSorted(input.requiredChecks.map(normalizeName).filter(Boolean));
  const scope = requiredCheckNames.length > 0 ? requiredCheckNames : [...checkStatusMap.keys()].sort();

  const missingRequiredChecks: string[] = [];
  const pendingChecks: string[] = [];
  const failedChecks: string[] = [];

  for (const checkName of scope) {
    const status = checkStatusMap.get(checkName);
    if (!status) {
      if (requiredCheckNames.length > 0) {
        missingRequiredChecks.push(checkName);
      }
      continue;
    }

    if (status === 'pending') {
      pendingChecks.push(checkName);
    } else if (status === 'failure') {
      failedChecks.push(checkName);
    }
  }

  if (missingRequiredChecks.length > 0) {
    denyReasons.push('checks_missing');
  }
  if (pendingChecks.length > 0) {
    denyReasons.push('checks_pending');
  }
  if (failedChecks.length > 0) {
    denyReasons.push('checks_failed');
  }

  const blockingReviewers = collectReviewBlockers(input.reviews);
  if (blockingReviewers.length > 0) {
    denyReasons.push('review_changes_requested');
  }

  const uniqueReasons = [...new Set(denyReasons)];
  return {
    decision: uniqueReasons.length > 0 ? 'deny' : 'allow',
    denyReasons: uniqueReasons,
    missingRequiredChecks,
    pendingChecks,
    failedChecks,
    blockingReviewers,
  };
}

export function parseRequiredMergeChecks(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return uniqueSorted(
    rawValue
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(normalizeName)
  );
}

export function normalizeCombinedStatusState(state: string | null | undefined): MergeGateCheck['status'] {
  const normalized = (state ?? '').toLowerCase();
  if (normalized === 'success') {
    return 'success';
  }
  if (normalized === 'pending') {
    return 'pending';
  }
  return 'failure';
}

export function normalizeCheckRunConclusion(
  status: string | null | undefined,
  conclusion: string | null | undefined
): MergeGateCheck['status'] {
  const normalizedStatus = (status ?? '').toLowerCase();
  const normalizedConclusion = (conclusion ?? '').toLowerCase();

  if (normalizedStatus === 'queued' || normalizedStatus === 'in_progress' || normalizedStatus === 'waiting') {
    return 'pending';
  }

  if (normalizedConclusion === 'success' || normalizedConclusion === 'neutral' || normalizedConclusion === 'skipped') {
    return 'success';
  }

  if (!normalizedConclusion) {
    return normalizedStatus === 'completed' ? 'failure' : 'pending';
  }

  return 'failure';
}
