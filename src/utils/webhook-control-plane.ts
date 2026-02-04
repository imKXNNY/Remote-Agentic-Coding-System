import { createHash } from 'crypto';
import { WebhookRiskTier } from './webhook-policy';

export type WebhookRunStatus =
  | 'accepted'
  | 'deduped'
  | 'blocked_policy'
  | 'requires_approval'
  | 'executed'
  | 'paused';

export const WEBHOOK_RUN_REASONS = {
  RETRY_SCHEDULED: 'retry_scheduled',
  RETRY_EXHAUSTED: 'retry_exhausted',
  COOLDOWN_ACTIVE: 'cooldown_active',
  ABORTED_GUARDRAIL: 'aborted_guardrail',
  SUCCEEDED: 'succeeded',
  APPROVAL_REQUIRED: 'approval_required',
} as const;

export type WebhookRunReasonCode =
  (typeof WEBHOOK_RUN_REASONS)[keyof typeof WEBHOOK_RUN_REASONS];

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

export interface AutonomousRetryPolicyInput {
  riskTier: WebhookRiskTier;
  repeatedFailureCount: number;
}

export interface AutonomousRetryPolicyDecision {
  shouldRetry: boolean;
  shouldPause: boolean;
  maxAttempts: number;
  reason: 'retry_scheduled' | 'retry_exhausted';
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

function parseRetryAttempts(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function resolveMaxRetryAttempts(riskTier: WebhookRiskTier): number {
  switch (riskTier) {
    case 'high':
      return parseRetryAttempts('WEBHOOK_MAX_RETRIES_HIGH_RISK', 1);
    case 'medium':
      return parseRetryAttempts('WEBHOOK_MAX_RETRIES_MEDIUM_RISK', 2);
    case 'low':
      return parseRetryAttempts('WEBHOOK_MAX_RETRIES_LOW_RISK', 3);
    default:
      return 1;
  }
}

export function evaluateAutonomousRetryPolicy(
  input: AutonomousRetryPolicyInput
): AutonomousRetryPolicyDecision {
  const maxAttempts = resolveMaxRetryAttempts(input.riskTier);
  if (input.repeatedFailureCount >= maxAttempts) {
    return {
      shouldRetry: false,
      shouldPause: true,
      maxAttempts,
      reason: 'retry_exhausted',
    };
  }

  return {
    shouldRetry: true,
    shouldPause: false,
    maxAttempts,
    reason: 'retry_scheduled',
  };
}

export function buildFailureSignature(errorMessage: string, exitCode: number, failingTests: string[]): string {
  const sortedTests = [...failingTests].sort();
  const payload = `${errorMessage}:${String(exitCode)}:${sortedTests.join(',')}`;
  return createHash('sha256').update(payload).digest('hex');
}
