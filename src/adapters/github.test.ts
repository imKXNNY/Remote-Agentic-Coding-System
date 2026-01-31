import { GitHubAdapter } from './github';
import { exec } from 'child_process';

// Mock dependencies
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: { createComment: jest.fn() },
      repos: { get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }) }
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
jest.mock('../orchestrator/orchestrator', () => ({
  handleMessage: jest.fn()
}));

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

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
});
