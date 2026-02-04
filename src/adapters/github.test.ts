import { GitHubAdapter } from './github';
import { exec } from 'child_process';

// Mock dependencies
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: { createComment: jest.fn() },
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getCombinedStatusForRef: jest.fn().mockResolvedValue({
          data: {
            statuses: [
              { context: 'ci / test', state: 'success' },
              { context: 'lint', state: 'success' },
            ],
          },
        }),
        getCollaboratorPermissionLevel: jest.fn().mockResolvedValue({ data: { permission: 'write' } }),
      },
      checks: {
        listForRef: jest.fn().mockResolvedValue({
          data: {
            check_runs: [
              { name: 'ci / test', status: 'completed', conclusion: 'success' },
              { name: 'lint', status: 'completed', conclusion: 'success' },
            ],
          },
        }),
      },
      pulls: {
        get: jest.fn().mockResolvedValue({
          data: {
            number: 31,
            state: 'open',
            head: { sha: 'sha-1' },
            mergeable: true,
            mergeable_state: 'clean',
          },
        }),
        listReviews: jest.fn().mockResolvedValue({ data: [] }),
        merge: jest.fn().mockResolvedValue({
          data: { merged: true, message: 'Pull Request successfully merged', sha: 'sha-merged' },
        }),
      },
    }
  }))
}));

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([])
}));
// Mock DB interactions
jest.mock('../db/conversations', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1', codebase_id: 'codebase-1' }),
  updateConversation: jest.fn(),
  getCodebaseCommands: jest.fn().mockResolvedValue([])
}));
jest.mock('../db/codebases', () => ({
  findCodebaseByRepoUrl: jest.fn(),
  createCodebase: jest.fn().mockResolvedValue({ id: 'codebase-new', name: 'repo', default_cwd: '/workspace/repo' }),
  getCodebaseCommands: jest.fn().mockResolvedValue([]),
  updateCodebaseCommands: jest.fn()
}));
jest.mock('../db/sessions', () => ({
  getActiveSession: jest.fn().mockResolvedValue(null)
}));
jest.mock('../db/webhook-control-plane', () => ({
  intakeWebhookRun: jest.fn(),
  finalizeWebhookRun: jest.fn(),
  registerWebhookFailure: jest.fn(),
  setWebhookChainCooldown: jest.fn(),
  addWebhookRunEvent: jest.fn(),
  pauseWebhookChain: jest.fn(),
  resumeWebhookChain: jest.fn(),
  overrideWebhookChainCooldown: jest.fn(),
  overrideRepositoryCircuitBreaker: jest.fn(),
  approveWebhookRun: jest.fn(),
  recordRepositoryAutomationOverride: jest.fn(),
}));
jest.mock('../orchestrator/orchestrator', () => ({
  handleMessage: jest.fn()
}));

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  const webhookDb = jest.requireMock('../db/webhook-control-plane') as {
    intakeWebhookRun: jest.Mock;
    finalizeWebhookRun: jest.Mock;
    registerWebhookFailure: jest.Mock;
    setWebhookChainCooldown: jest.Mock;
    addWebhookRunEvent: jest.Mock;
    pauseWebhookChain: jest.Mock;
    resumeWebhookChain: jest.Mock;
    overrideWebhookChainCooldown: jest.Mock;
    overrideRepositoryCircuitBreaker: jest.Mock;
    approveWebhookRun: jest.Mock;
    recordRepositoryAutomationOverride: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GitHubAdapter('fake-token', 'fake-secret');
  });

  describe('generateIssueTriage', () => {
    it('parses structured Codex output correctly', async () => {
      // Setup mock output
      const mockTriage = {
        severity: 'high',
        component: 'auth',
        estimated_effort: '2d',
        suggested_labels: ['bug', 'urgent'],
        technical_summary: 'Root cause analysis suggests...'
      };

      // Mock exec to call callback with success
      (exec as unknown as jest.Mock).mockImplementation((_cmd, cb) => {
        cb(null, { stdout: JSON.stringify(mockTriage), stderr: '' });
      });

      const result = await (adapter as any).generateIssueTriage({
        title: 'Login broken',
        body: 'Cannot login',
        number: 1
      });

      expect(result).toContain('Severity**: HIGH');
      expect(result).toContain('Component**: `auth`');
      expect(result).toContain('Root cause analysis');
      
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('codex exec'),
        expect.anything() // callback
      );
    });

    it('handles Codex failure gracefully', async () => {
      // Mock exec to call callback with error
      (exec as unknown as jest.Mock).mockImplementation((_cmd, cb) => {
        cb(new Error('Codex crashed'), { stdout: '', stderr: 'error' });
      });

      const result = await (adapter as any).generateIssueTriage({
        title: 'Crash',
        body: 'Boom',
        number: 2
      });

      expect(result).toContain('(Automated triage failed');
    });
  });

  describe('processWebhook', () => {
    test('records and finalizes retry_scheduled when preprocessing throws and retries remain', async () => {
      webhookDb.registerWebhookFailure.mockResolvedValueOnce({
        shouldPause: false,
        failureSignature: 'sig-1',
        repeatedFailureCount: 1,
        circuitBreakerTripped: false,
      });
      jest.spyOn(adapter as any, 'getOrCreateCodebaseForRepo').mockRejectedValueOnce(new Error('setup failed'));
      jest.spyOn(adapter as any, 'sendMessage').mockResolvedValueOnce(undefined);

      await adapter.processWebhook({
        runId: 'run-1',
        chainId: 'chain-1',
        riskTier: 'medium',
        event: {} as any,
        parsed: {
          owner: 'imKXNNY',
          repo: 'Remote-Agentic-Coding-System',
          number: 30,
          comment: '@remote-agent /status',
          eventType: 'issue_comment',
          issue: undefined,
          pullRequest: undefined,
        },
      });

      expect(webhookDb.registerWebhookFailure).toHaveBeenCalledWith(
        'chain-1',
        'run-1',
        'setup failed',
        2
      );
      expect(webhookDb.finalizeWebhookRun).toHaveBeenCalledWith(
        'run-1',
        'blocked_policy',
        'retry_scheduled'
      );
      expect(webhookDb.setWebhookChainCooldown).toHaveBeenCalledWith('chain-1', expect.any(Date));
      expect(webhookDb.addWebhookRunEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-1',
          chainId: 'chain-1',
          eventType: 'retry_scheduled',
          status: 'blocked_policy',
        })
      );
      expect((adapter as any).sendMessage).toHaveBeenCalled();
    });

    test('finalizes retry_exhausted and pauses when retry budget is exhausted', async () => {
      webhookDb.registerWebhookFailure.mockResolvedValueOnce({
        shouldPause: true,
        failureSignature: 'sig-2',
        repeatedFailureCount: 1,
        circuitBreakerTripped: false,
      });
      jest.spyOn(adapter as any, 'getOrCreateCodebaseForRepo').mockRejectedValueOnce(new Error('setup failed'));
      jest.spyOn(adapter as any, 'sendMessage').mockResolvedValueOnce(undefined);

      await adapter.processWebhook({
        runId: 'run-2',
        chainId: 'chain-2',
        riskTier: 'high',
        event: {} as any,
        parsed: {
          owner: 'imKXNNY',
          repo: 'Remote-Agentic-Coding-System',
          number: 31,
          comment: '@remote-agent /status',
          eventType: 'issue_comment',
          issue: undefined,
          pullRequest: undefined,
        },
      });

      expect(webhookDb.finalizeWebhookRun).toHaveBeenCalledWith('run-2', 'paused', 'retry_exhausted');
      expect(webhookDb.setWebhookChainCooldown).not.toHaveBeenCalled();
      expect(webhookDb.addWebhookRunEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-2',
          chainId: 'chain-2',
          eventType: 'retry_exhausted',
          status: 'paused',
        })
      );
      expect((adapter as any).sendMessage).toHaveBeenCalled();
    });
  });

  describe('ingestWebhook', () => {
    test('returns requires_approval for high-risk policy decisions', async () => {
      webhookDb.intakeWebhookRun.mockResolvedValueOnce({
        decision: 'requires_approval',
        chain: { id: 'chain-approval' },
        run: { id: 'run-approval', reason: 'high_risk_requires_approval', risk_tier: 'high', policy_decision: 'requires_approval' },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent /command-invoke auth migration change', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'u' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.shouldProcess).toBe(false);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'requires_approval',
          runId: 'run-approval',
          riskTier: 'high',
        })
      );
    });

    test('returns blocked policy when protected path appears', async () => {
      webhookDb.intakeWebhookRun.mockResolvedValueOnce({
        decision: 'blocked',
        chain: { id: 'chain-blocked' },
        run: { id: 'run-blocked', reason: 'protected_path_blocked', risk_tier: 'medium', policy_decision: 'blocked' },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent /command-invoke edit .env', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'u' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.shouldProcess).toBe(false);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'blocked_policy',
          runId: 'run-blocked',
        })
      );
    });

    test('approve-run command succeeds for maintainer', async () => {
      webhookDb.approveWebhookRun.mockResolvedValueOnce({ id: 'run-1', chain_id: 'chain-1' });
      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent approve-run run-1', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(expect.objectContaining({ status: 'approval_granted', runId: 'run-1' }));
      expect(webhookDb.approveWebhookRun).toHaveBeenCalledWith('run-1', 'maintainer');
    });

    test('approve-run command fails for non-maintainer', async () => {
      const octokit = (adapter as any).octokit;
      octokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValueOnce({ data: { permission: 'read' } });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent approve-run run-2', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'reader' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(403);
      expect(result.body).toEqual(expect.objectContaining({ status: 'approval_denied' }));
      expect(webhookDb.approveWebhookRun).not.toHaveBeenCalled();
    });

    test('returns deduped intake result for duplicate delivery', async () => {
      webhookDb.intakeWebhookRun.mockResolvedValueOnce({
        decision: 'deduped',
        chain: { id: 'chain-1' },
        run: { id: 'run-1' },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 30, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent /status', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'u' },
      });

      // Bypass signature verification to focus on control-plane behavior
      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);

      const result = await adapter.ingestWebhook(payload, 'sha256=fake', {
        deliveryId: 'delivery-1',
        eventName: 'issue_comment',
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'deduped',
          chainId: 'chain-1',
          runId: 'run-1',
        })
      );
    });

    test('returns paused intake result when guardrails pause chain', async () => {
      webhookDb.intakeWebhookRun.mockResolvedValueOnce({
        decision: 'paused',
        chain: { id: 'chain-2' },
        run: { id: 'run-2', reason: 'cooldown_active' },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 30, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent /command-invoke execute', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'u' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);

      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.shouldProcess).toBe(false);
      expect(result.httpStatus).toBe(202);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'paused',
          reason: 'cooldown_active',
          chainId: 'chain-2',
          runId: 'run-2',
        })
      );
    });

    test('merge-gate command returns deterministic allow decision', async () => {
      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent merge-gate 31 --dry-run', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'merge_gate_passed',
          action: 'merge_gate',
          decision: 'allow',
          dryRun: true,
        })
      );
    });

    test('auto-merge command blocks on pending checks', async () => {
      const octokit = (adapter as any).octokit;
      octokit.rest.repos.getCombinedStatusForRef.mockResolvedValueOnce({
        data: {
          statuses: [{ context: 'ci / test', state: 'pending' }],
        },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent auto-merge 31', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'merge_gate_denied',
          action: 'auto_merge',
          decision: 'deny',
        })
      );
      expect(result.body).toEqual(expect.objectContaining({ denyReasons: expect.arrayContaining(['checks_pending']) }));
      expect(octokit.rest.pulls.merge).not.toHaveBeenCalled();
    });

    test('auto-merge command allows audited override', async () => {
      const octokit = (adapter as any).octokit;
      octokit.rest.repos.getCombinedStatusForRef.mockResolvedValueOnce({
        data: {
          statuses: [{ context: 'ci / test', state: 'failure' }],
        },
      });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent auto-merge 31 --override maintainer-reviewed-risk', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'auto_merged',
          action: 'auto_merge',
          overrideApplied: true,
        })
      );
      expect(webhookDb.recordRepositoryAutomationOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryFullName: 'imKXNNY/Remote-Agentic-Coding-System',
          action: 'override_merge_gate',
          actor: 'maintainer',
        })
      );
      expect(octokit.rest.pulls.merge).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'imKXNNY',
          repo: 'Remote-Agentic-Coding-System',
          pull_number: 31,
        })
      );
    });

    test('auto-merge parser avoids dry-run false positives in override reason', async () => {
      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: {
          body: '@remote-agent auto-merge 31 --override manual-note-with---dry-run-text',
          user: { login: 'u' },
        },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          status: 'auto_merged',
          action: 'auto_merge',
          overrideApplied: false,
        })
      );
      expect(webhookDb.recordRepositoryAutomationOverride).not.toHaveBeenCalled();
    });

    test('merge-gate fetches additional pages for checks and reviews', async () => {
      const octokit = (adapter as any).octokit;
      octokit.rest.checks.listForRef
        .mockResolvedValueOnce({
          data: {
            check_runs: Array.from({ length: 100 }, (_, i) => ({
              name: `check-${String(i)}`,
              status: 'completed',
              conclusion: 'success',
            })),
          },
        })
        .mockResolvedValueOnce({
          data: {
            check_runs: [{ name: 'check-100', status: 'completed', conclusion: 'success' }],
          },
        });
      octokit.rest.pulls.listReviews
        .mockResolvedValueOnce({
          data: Array.from({ length: 100 }, (_, i) => ({
            user: { login: `reviewer-${String(i)}` },
            state: 'APPROVED',
          })),
        })
        .mockResolvedValueOnce({
          data: [{ user: { login: 'reviewer-100' }, state: 'APPROVED' }],
        });

      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent merge-gate 31', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(octokit.rest.checks.listForRef).toHaveBeenCalledTimes(2);
      expect(octokit.rest.pulls.listReviews).toHaveBeenCalledTimes(2);
    });

    test('pause-loop command succeeds for maintainer', async () => {
      webhookDb.pauseWebhookChain.mockResolvedValueOnce({ id: 'chain-1' });
      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent pause-loop chain-1 too-many-failures', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(expect.objectContaining({ status: 'control_applied', action: 'pause_loop' }));
      expect(webhookDb.pauseWebhookChain).toHaveBeenCalledWith(
        'chain-1',
        'imKXNNY/Remote-Agentic-Coding-System',
        'maintainer',
        'too-many-failures'
      );
    });

    test('override-circuit-breaker command succeeds for maintainer', async () => {
      webhookDb.overrideRepositoryCircuitBreaker.mockResolvedValueOnce({ status: 'closed' });
      const payload = JSON.stringify({
        action: 'created',
        issue: { number: 31, title: 'x', body: 'y', user: { login: 'u' }, labels: [], state: 'open' },
        comment: { body: '@remote-agent override-circuit-breaker manual-unblock-after-check', user: { login: 'u' } },
        repository: {
          owner: { login: 'imKXNNY' },
          name: 'Remote-Agentic-Coding-System',
          full_name: 'imKXNNY/Remote-Agentic-Coding-System',
          html_url: 'https://github.com/imKXNNY/Remote-Agentic-Coding-System',
          default_branch: 'stable',
        },
        sender: { login: 'maintainer' },
      });

      jest.spyOn(adapter as any, 'verifySignature').mockReturnValue(true);
      const result = await adapter.ingestWebhook(payload, 'sha256=fake');

      expect(result.httpStatus).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({ status: 'control_applied', action: 'override_circuit_breaker' })
      );
      expect(webhookDb.overrideRepositoryCircuitBreaker).toHaveBeenCalledWith(
        'imKXNNY/Remote-Agentic-Coding-System',
        'maintainer',
        'manual-unblock-after-check'
      );
    });
  });
});
