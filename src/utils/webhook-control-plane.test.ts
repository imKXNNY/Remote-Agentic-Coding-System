import {
  buildFailureSignature,
  buildWebhookDedupeKey,
  computeDeterministicJitterSeconds,
  computeRetryCooldownUntil,
  deriveWebhookDeliveryId,
  evaluateAutonomousRetryPolicy,
  evaluateWebhookGuardrails,
  isTerminalWebhookRunStatus,
  resolveMaxRetryAttempts,
  WEBHOOK_RUN_REASONS,
} from './webhook-control-plane';

describe('webhook control-plane utils', () => {
  test('buildWebhookDedupeKey includes all required dimensions', () => {
    const key = buildWebhookDedupeKey({
      deliveryId: 'abc-123',
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      objectType: 'issue_comment',
      objectNumber: 30,
      action: 'created',
      headSha: 'deadbeef',
    });

    expect(key).toBe(
      'abc-123:imKXNNY/Remote-Agentic-Coding-System:issue_comment:30:created:deadbeef'
    );
  });

  test('deriveWebhookDeliveryId falls back to payload hash when header is missing', () => {
    const payload = '{"hello":"world"}';
    const idA = deriveWebhookDeliveryId(payload);
    const idB = deriveWebhookDeliveryId(payload);

    expect(idA).toMatch(/^payload-[a-f0-9]{16}$/);
    expect(idA).toBe(idB);
  });

  test('evaluateWebhookGuardrails blocks paused chains', () => {
    const result = evaluateWebhookGuardrails({
      chainStatus: 'paused',
      isMutating: false,
      now: new Date('2026-02-03T00:00:00Z'),
      cooldownUntil: null,
      iterationCount: 0,
      maxIterations: 3,
      mutatingRuns24h: 0,
      maxMutatingRuns24h: 5,
    });

    expect(result).toEqual({ allowed: false, reason: 'chain_paused' });
  });

  test('evaluateWebhookGuardrails blocks iteration budget overflow', () => {
    const result = evaluateWebhookGuardrails({
      chainStatus: 'active',
      isMutating: false,
      now: new Date('2026-02-03T00:00:00Z'),
      cooldownUntil: null,
      iterationCount: 3,
      maxIterations: 3,
      mutatingRuns24h: 0,
      maxMutatingRuns24h: 5,
    });

    expect(result).toEqual({ allowed: false, reason: 'iteration_budget_exceeded' });
  });

  test('evaluateWebhookGuardrails blocks cooldown and mutating-run budgets', () => {
    const now = new Date('2026-02-03T00:00:00Z');

    const cooldownBlocked = evaluateWebhookGuardrails({
      chainStatus: 'active',
      isMutating: true,
      now,
      cooldownUntil: new Date('2026-02-03T00:05:00Z'),
      iterationCount: 0,
      maxIterations: 3,
      mutatingRuns24h: 0,
      maxMutatingRuns24h: 5,
    });
    expect(cooldownBlocked).toEqual({ allowed: false, reason: 'cooldown_active' });

    const budgetBlocked = evaluateWebhookGuardrails({
      chainStatus: 'active',
      isMutating: true,
      now,
      cooldownUntil: null,
      iterationCount: 0,
      maxIterations: 3,
      mutatingRuns24h: 5,
      maxMutatingRuns24h: 5,
    });
    expect(budgetBlocked).toEqual({ allowed: false, reason: 'mutating_budget_exceeded' });
  });

  test('buildFailureSignature is stable and terminal status check works', () => {
    const a = buildFailureSignature('pytest failed', 1, ['test_b', 'test_a']);
    const b = buildFailureSignature('pytest failed', 1, ['test_a', 'test_b']);

    expect(a).toBe(b);
    expect(isTerminalWebhookRunStatus('executed')).toBe(true);
    expect(isTerminalWebhookRunStatus('accepted')).toBe(false);
  });

  test('evaluateAutonomousRetryPolicy enforces bounded retries by risk tier', () => {
    const lowRisk = evaluateAutonomousRetryPolicy({
      riskTier: 'low',
      repeatedFailureCount: 2,
    });
    expect(lowRisk).toEqual(
      expect.objectContaining({
        shouldRetry: true,
        shouldPause: false,
        reason: WEBHOOK_RUN_REASONS.RETRY_SCHEDULED,
      })
    );

    const highRiskExhausted = evaluateAutonomousRetryPolicy({
      riskTier: 'high',
      repeatedFailureCount: 1,
    });
    expect(highRiskExhausted).toEqual(
      expect.objectContaining({
        shouldRetry: false,
        shouldPause: true,
        reason: WEBHOOK_RUN_REASONS.RETRY_EXHAUSTED,
      })
    );
  });

  test('resolveMaxRetryAttempts honors env overrides', () => {
    const original = process.env.WEBHOOK_MAX_RETRIES_MEDIUM_RISK;
    process.env.WEBHOOK_MAX_RETRIES_MEDIUM_RISK = '4';
    expect(resolveMaxRetryAttempts('medium')).toBe(4);
    if (typeof original === 'string') {
      process.env.WEBHOOK_MAX_RETRIES_MEDIUM_RISK = original;
    } else {
      delete process.env.WEBHOOK_MAX_RETRIES_MEDIUM_RISK;
    }
  });

  test('computeRetryCooldownUntil applies deterministic jitter', () => {
    const now = new Date('2026-02-04T00:00:00.000Z');
    const jitterA = computeDeterministicJitterSeconds('chain-1:run-1:1', 30);
    const jitterB = computeDeterministicJitterSeconds('chain-1:run-1:1', 30);

    expect(jitterA).toBe(jitterB);
    expect(jitterA).toBeGreaterThanOrEqual(0);
    expect(jitterA).toBeLessThanOrEqual(30);

    const cooldownUntil = computeRetryCooldownUntil({
      now,
      baseSeconds: 120,
      maxJitterSeconds: 30,
      seed: 'chain-1:run-1:1',
    });

    expect(cooldownUntil.getTime() - now.getTime()).toBe((120 + jitterA) * 1000);
  });

  test('reason code registry includes safety hardening reasons', () => {
    expect(WEBHOOK_RUN_REASONS.BUDGET_EXHAUSTED).toBe('budget_exhausted');
    expect(WEBHOOK_RUN_REASONS.CIRCUIT_BREAKER_OPEN).toBe('circuit_breaker_open');
    expect(WEBHOOK_RUN_REASONS.CIRCUIT_BREAKER_TRIPPED).toBe('circuit_breaker_tripped');
    expect(WEBHOOK_RUN_REASONS.MANUAL_OVERRIDE).toBe('manual_override');
  });
});
