import { evaluateWebhookPolicy } from './webhook-policy';

describe('webhook-policy evaluator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WEBHOOK_POLICY_ALLOWED_REPOS;
    delete process.env.WEBHOOK_POLICY_ALLOWED_BRANCHES;
    delete process.env.WEBHOOK_POLICY_ALLOWED_COMMANDS;
    delete process.env.WEBHOOK_POLICY_PROTECTED_PATHS;
    delete process.env.WEBHOOK_POLICY_REQUIRE_APPROVAL_FOR_MEDIUM;
    delete process.env.WEBHOOK_POLICY_OVERRIDE_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('blocks repository outside allowlist', () => {
    process.env.WEBHOOK_POLICY_ALLOWED_REPOS = 'imKXNNY/Remote-Agentic-Coding-System';
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'other/repo',
      targetBranch: 'feature/x',
      commandText: '/command-invoke update docs',
      isMutating: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        decision: 'blocked',
        reason: 'repo_not_allowed',
      })
    );
  });

  test('blocks protected path unless override token is present', () => {
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'feature/x',
      commandText: '/command-invoke edit .env',
      isMutating: true,
    });
    expect(result.decision).toBe('blocked');
    expect(result.reason).toBe('protected_path_blocked');

    const override = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'feature/x',
      commandText: '/command-invoke edit .env --policy-override',
      isMutating: true,
    });
    expect(override.decision).not.toBe('blocked');
  });

  test('requires approval for high risk operations', () => {
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'feature/x',
      commandText: '/command-invoke update auth migration',
      isMutating: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        decision: 'requires_approval',
        reason: 'high_risk_requires_approval',
        riskTier: 'high',
      })
    );
  });

  test('requires approval for disallowed branch on mutating command', () => {
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'stable',
      commandText: '/command-invoke update tests',
      isMutating: true,
    });
    expect(result.decision).toBe('requires_approval');
    expect(result.reason).toBe('branch_not_allowed');
  });

  test('override token bypasses branch restriction for low-risk command', () => {
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'stable',
      commandText: '/command-invoke update docs/readme.md --policy-override',
      isMutating: true,
    });
    expect(result.decision).toBe('allow');
    expect(result.reason).toBe('policy_allow');
    expect(result.riskTier).toBe('low');
  });

  test('allows safe read-only command', () => {
    const result = evaluateWebhookPolicy({
      repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
      targetBranch: 'stable',
      commandText: '/status',
      isMutating: false,
    });
    expect(result.decision).toBe('allow');
    expect(result.reason).toBe('policy_allow');
    expect(result.riskTier).toBe('low');
  });
});
