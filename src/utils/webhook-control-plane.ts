import { createHash } from 'crypto';

export type WebhookRunStatus =
  | 'accepted'
  | 'deduped'
  | 'blocked_policy'
  | 'requires_approval'
  | 'executed'
  | 'paused';

export interface DedupeKeyInput {
  deliveryId: string;
  repositoryFullName: string;
  objectType: string;
  objectNumber: number;
  action: string;
  headSha?: string | null;
}

export interface GuardrailEvaluationInput {
  chainStatus: 'active' | 'paused';
  isMutating: boolean;
  now: Date;
  cooldownUntil: Date | null;
  iterationCount: number;
  maxIterations: number;
  mutatingRuns24h: number;
  maxMutatingRuns24h: number;
}

export interface GuardrailEvaluation {
  allowed: boolean;
  reason?: 'chain_paused' | 'cooldown_active' | 'iteration_budget_exceeded' | 'mutating_budget_exceeded';
}

export function isTerminalWebhookRunStatus(status: WebhookRunStatus): boolean {
  return status !== 'accepted';
}

export function buildWebhookDedupeKey(input: DedupeKeyInput): string {
  const headShaPart = input.headSha ?? 'none';
  return [
    input.deliveryId,
    input.repositoryFullName,
    input.objectType,
    String(input.objectNumber),
    input.action,
    headShaPart,
  ].join(':');
}

export function deriveWebhookDeliveryId(payload: string, deliveryIdHeader?: string): string {
  const candidate = deliveryIdHeader?.trim();
  if (candidate) {
    return candidate;
  }

  // Fallback for environments where x-github-delivery is absent.
  return `payload-${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}

export function evaluateWebhookGuardrails(input: GuardrailEvaluationInput): GuardrailEvaluation {
  if (input.chainStatus === 'paused') {
    return { allowed: false, reason: 'chain_paused' };
  }

  if (input.iterationCount >= input.maxIterations) {
    return { allowed: false, reason: 'iteration_budget_exceeded' };
  }

  if (input.isMutating) {
    if (input.cooldownUntil && input.cooldownUntil.getTime() > input.now.getTime()) {
      return { allowed: false, reason: 'cooldown_active' };
    }

    if (input.mutatingRuns24h >= input.maxMutatingRuns24h) {
      return { allowed: false, reason: 'mutating_budget_exceeded' };
    }
  }

  return { allowed: true };
}

export function buildFailureSignature(errorMessage: string, exitCode: number, failingTests: string[]): string {
  const payload = `${errorMessage}:${String(exitCode)}:${failingTests.sort().join(',')}`;
  return createHash('sha256').update(payload).digest('hex');
}
