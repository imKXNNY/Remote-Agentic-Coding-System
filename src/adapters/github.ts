/**
 * GitHub platform adapter using Octokit REST API and Webhooks
 * Handles issue and PR comments with @mention detection
 */
import { Octokit } from '@octokit/rest';
import { createHmac } from 'crypto';
import { IPlatformAdapter } from '../types';
import { handleMessage } from '../orchestrator/orchestrator';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as webhookDb from '../db/webhook-control-plane';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, access } from 'fs/promises';
import { join } from 'path';
import {
  buildWebhookDedupeKey,
  computeRetryCooldownUntil,
  deriveWebhookDeliveryId,
  evaluateAutonomousRetryPolicy,
  WEBHOOK_RUN_REASONS,
} from '../utils/webhook-control-plane';
import { evaluateWebhookPolicy, WebhookRiskTier } from '../utils/webhook-policy';
import {
  evaluateMergeGate,
  normalizeCheckRunConclusion,
  normalizeCombinedStatusState,
  parseRequiredMergeChecks,
} from '../utils/merge-gate';

const execAsync = promisify(exec);

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveRetryCooldownSeconds(): { baseSeconds: number; maxJitterSeconds: number } {
  return {
    baseSeconds: parsePositiveInteger(process.env.WEBHOOK_RETRY_COOLDOWN_SECONDS, 120),
    maxJitterSeconds: parsePositiveInteger(process.env.WEBHOOK_RETRY_COOLDOWN_JITTER_SECONDS, 30),
  };
}

interface WebhookEvent {
  action: string;
  issue?: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    labels: { name: string }[];
    state: string;
  };
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    state: string;
    head?: { sha: string };
    ref?: string;
    changed_files?: number;
    additions?: number;
    deletions?: number;
  };
  comment?: {
    body: string;
    user: { login: string };
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
    html_url: string;
    default_branch: string;
  };
  sender: { login: string };
}

interface TriageResult {
  severity: string;
  component: string;
  estimated_effort: string;
  suggested_labels: string[];
  technical_summary: string;
}

interface WebhookMetadata {
  deliveryId?: string;
  eventName?: string;
}

interface WebhookProcessContext {
  runId: string;
  chainId: string;
  riskTier: WebhookRiskTier;
  event: WebhookEvent;
  parsed: {
    owner: string;
    repo: string;
    number: number;
    comment: string;
    eventType: 'issue' | 'issue_comment' | 'pull_request';
    issue?: WebhookEvent['issue'];
    pullRequest?: WebhookEvent['pull_request'];
  };
}

interface WebhookIntakeResult {
  httpStatus: number;
  body: Record<string, unknown>;
  shouldProcess: boolean;
  context?: WebhookProcessContext;
}

interface ChainControlCommand {
  chainId: string;
  reason: string;
}

interface MergeGateCommand {
  pullNumber: number;
  dryRun: boolean;
}

interface AutoMergeCommand extends MergeGateCommand {
  overrideReason?: string;
}

export class GitHubAdapter implements IPlatformAdapter {
  private octokit: Octokit;
  private webhookSecret: string;

  constructor(token: string, webhookSecret: string) {
    this.octokit = new Octokit({ auth: token });
    this.webhookSecret = webhookSecret;
    console.log('[GitHub] Adapter initialized with secret:', webhookSecret.substring(0, 8) + '...');
  }

  /**
   * Send a message to a GitHub issue or PR
   */
  async sendMessage(conversationId: string, message: string): Promise<void> {
    const parsed = this.parseConversationId(conversationId);
    if (!parsed) {
      console.error('[GitHub] Invalid conversationId:', conversationId);
      return;
    }

    try {
      await this.octokit.rest.issues.createComment({
        owner: parsed.owner,
        repo: parsed.repo,
        issue_number: parsed.number,
        body: message,
      });
      console.log(`[GitHub] Comment posted to ${conversationId}`);
    } catch (error) {
      console.error('[GitHub] Failed to post comment:', { error, conversationId });
    }
  }

  /**
   * Get streaming mode (always batch for GitHub to avoid comment spam)
   */
  getStreamingMode(): 'batch' {
    return 'batch';
  }

  /**
   * Get platform type
   */
  getPlatformType(): string {
    return 'github';
  }

  /**
   * Start the adapter (no-op for webhook-based adapter)
   */
  async start(): Promise<void> {
    console.log('[GitHub] Webhook adapter ready');
  }

  /**
   * Stop the adapter (no-op for webhook-based adapter)
   */
  stop(): void {
    console.log('[GitHub] Adapter stopped');
  }

  /**
   * Verify webhook signature using HMAC SHA-256
   */
  private verifySignature(payload: string, signature: string): boolean {
    try {
      const hmac = createHmac('sha256', this.webhookSecret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');
      const isValid = digest === signature;

      if (!isValid) {
        console.error('[GitHub] Signature mismatch:', {
          received: signature.substring(0, 15) + '...',
          computed: digest.substring(0, 15) + '...',
          secretLength: this.webhookSecret.length,
        });
      }

      return isValid;
    } catch (error) {
      console.error('[GitHub] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Parse webhook event and extract relevant data
   */
  private parseEvent(event: WebhookEvent): {
    owner: string;
    repo: string;
    number: number;
    comment: string;
    eventType: 'issue' | 'issue_comment' | 'pull_request';
    issue?: WebhookEvent['issue'];
    pullRequest?: WebhookEvent['pull_request'];
  } | null {
    const owner = event.repository.owner.login;
    const repo = event.repository.name;

    // issue_comment (covers both issues and PRs)
    if (event.comment) {
      const number = event.issue?.number ?? event.pull_request?.number;
      if (!number) return null;
      return {
        owner,
        repo,
        number,
        comment: event.comment.body,
        eventType: 'issue_comment',
        issue: event.issue,
        pullRequest: event.pull_request,
      };
    }

    // issues.opened
    if (event.issue && event.action === 'opened') {
      return {
        owner,
        repo,
        number: event.issue.number,
        comment: event.issue.body ?? '',
        eventType: 'issue',
        issue: event.issue,
      };
    }

    // pull_request.opened
    if (event.pull_request && event.action === 'opened') {
      return {
        owner,
        repo,
        number: event.pull_request.number,
        comment: event.pull_request.body ?? '',
        eventType: 'pull_request',
        pullRequest: event.pull_request,
      };
    }

    return null;
  }

  /**
   * Check if text contains @remote-agent mention
   */
  private hasMention(text: string): boolean {
    return /@remote-agent[\s,:;]/.test(text) || text.trim() === '@remote-agent';
  }

  /**
   * Strip @remote-agent mention from text
   */
  private stripMention(text: string): string {
    return text.replace(/@remote-agent[\s,:;]+/g, '').trim();
  }

  /**
   * Build conversationId from owner, repo, and number
   */
  private buildConversationId(owner: string, repo: string, number: number): string {
    return `${owner}/${repo}#${number}`;
  }

  /**
   * Parse conversationId into owner, repo, and number
   */
  private parseConversationId(
    conversationId: string
  ): { owner: string; repo: string; number: number } | null {
    const regex = /^([^/]+)\/([^#]+)#(\d+)$/;
    const match = regex.exec(conversationId);
    if (!match) return null;
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  private extractApproveRunId(comment: string): string | null {
    const match = /^approve-run\s+([a-zA-Z0-9-]+)/i.exec(comment.trim());
    return match?.[1] ?? null;
  }

  private extractPauseLoopCommand(comment: string): ChainControlCommand | null {
    const match = /^pause-loop\s+([a-zA-Z0-9-]+)\s+(.+)/i.exec(comment.trim());
    if (!match) {
      return null;
    }
    return { chainId: match[1], reason: match[2].trim() };
  }

  private extractResumeLoopCommand(comment: string): ChainControlCommand | null {
    const match = /^resume-loop\s+([a-zA-Z0-9-]+)\s+(.+)/i.exec(comment.trim());
    if (!match) {
      return null;
    }
    return { chainId: match[1], reason: match[2].trim() };
  }

  private extractOverrideCooldownCommand(comment: string): ChainControlCommand | null {
    const match = /^override-cooldown\s+([a-zA-Z0-9-]+)\s+(.+)/i.exec(comment.trim());
    if (!match) {
      return null;
    }
    return { chainId: match[1], reason: match[2].trim() };
  }

  private extractOverrideIterationCommand(comment: string): ChainControlCommand | null {
    const match = /^override-iteration\s+([a-zA-Z0-9-]+)\s+(.+)/i.exec(comment.trim());
    if (!match) {
      return null;
    }
    return { chainId: match[1], reason: match[2].trim() };
  }

  private extractOverrideCircuitBreakerReason(comment: string): string | null {
    const match = /^override-circuit-breaker\s+(.+)/i.exec(comment.trim());
    if (!match) {
      return null;
    }
    return match[1].trim();
  }

  private extractMergeGateCommand(comment: string): MergeGateCommand | null {
    const tokens = comment.trim().split(/\s+/).filter(Boolean);
    if (tokens[0]?.toLowerCase() !== 'merge-gate') {
      return null;
    }

    const pullNumber = Number.parseInt(tokens[1] ?? '', 10);
    if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
      return null;
    }

    const dryRun = tokens.slice(2).some(token => token.toLowerCase() === '--dry-run');
    return { pullNumber, dryRun };
  }

  private extractAutoMergeCommand(comment: string): AutoMergeCommand | null {
    const trimmed = comment.trim();
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens[0]?.toLowerCase() !== 'auto-merge') {
      return null;
    }

    const pullNumber = Number.parseInt(tokens[1] ?? '', 10);
    if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
      return null;
    }

    const loweredTokens = tokens.map(token => token.toLowerCase());
    const dryRun = loweredTokens.includes('--dry-run');
    const overrideIndex = loweredTokens.indexOf('--override');
    const overrideReason =
      overrideIndex >= 0 ? tokens.slice(overrideIndex + 1).join(' ').trim() || undefined : undefined;

    return {
      pullNumber,
      dryRun,
      overrideReason,
    };
  }

  private resolveMergeMethod(): 'merge' | 'squash' | 'rebase' {
    const rawValue = (process.env.WEBHOOK_MERGE_METHOD ?? 'squash').toLowerCase();
    if (rawValue === 'merge' || rawValue === 'squash' || rawValue === 'rebase') {
      return rawValue;
    }
    return 'squash';
  }

  private async evaluatePullRequestMergeGate(owner: string, repo: string, pullNumber: number): Promise<{
    decision: 'allow' | 'deny';
    denyReasons: string[];
    missingRequiredChecks: string[];
    pendingChecks: string[];
    failedChecks: string[];
    blockingReviewers: string[];
    pullRequestState: string;
    mergeableState: string | null;
    mergeable: boolean | null;
    requiredChecks: string[];
    headSha: string;
  }> {
    const requiredChecks = parseRequiredMergeChecks(process.env.WEBHOOK_MERGE_GATE_REQUIRED_CHECKS);
    const pullResponse = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    const pull = pullResponse.data;

    const combinedStatusResponse = await this.octokit.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref: pull.head.sha,
    });

    const checkRuns: { name: string; status: string | null; conclusion: string | null }[] = [];
    let checkRunsPage = 1;
    while (true) {
      const response = await this.octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: pull.head.sha,
        per_page: 100,
        page: checkRunsPage,
      });
      checkRuns.push(
        ...response.data.check_runs.map(checkRun => ({
          name: checkRun.name,
          status: checkRun.status,
          conclusion: checkRun.conclusion ?? null,
        }))
      );
      if (response.data.check_runs.length < 100) {
        break;
      }
      checkRunsPage += 1;
    }

    const reviews: { author: string; state: string }[] = [];
    let reviewsPage = 1;
    while (true) {
      const response = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
        page: reviewsPage,
      });
      const pageReviews = response.data
        .filter(review => Boolean(review.user?.login))
        .map(review => ({
          author: review.user?.login ?? '',
          state: review.state ?? 'COMMENTED',
        }));
      reviews.push(...pageReviews);
      if (response.data.length < 100) {
        break;
      }
      reviewsPage += 1;
    }

    const observedChecks = [
      ...combinedStatusResponse.data.statuses.map(status => ({
        name: status.context,
        status: normalizeCombinedStatusState(status.state),
        source: 'status' as const,
      })),
      ...checkRuns.map(checkRun => ({
        name: checkRun.name,
        status: normalizeCheckRunConclusion(checkRun.status, checkRun.conclusion),
        source: 'check_run' as const,
      })),
    ];

    const evaluation = evaluateMergeGate({
      pullRequestState: pull.state,
      mergeable: pull.mergeable,
      mergeableState: pull.mergeable_state ?? null,
      requiredChecks,
      observedChecks,
      reviews,
    });

    return {
      ...evaluation,
      pullRequestState: pull.state,
      mergeableState: pull.mergeable_state ?? null,
      mergeable: pull.mergeable,
      requiredChecks,
      headSha: pull.head.sha,
    };
  }

  private async isMaintainer(owner: string, repo: string, username: string): Promise<boolean> {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });
      return ['admin', 'maintain', 'write'].includes(data.permission);
    } catch (error) {
      console.warn('[GitHub] Failed to resolve maintainer permission', {
        owner,
        repo,
        username,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Ensure repository is cloned and ready
   * For new conversations: clone or sync
   * For existing conversations: skip
   */
  private async ensureRepoReady(
    owner: string,
    repo: string,
    defaultBranch: string,
    repoPath: string,
    shouldSync: boolean
  ): Promise<void> {
    try {
      await access(repoPath);
      if (shouldSync) {
        console.log('[GitHub] Syncing repository');
        await execAsync(
          `cd ${repoPath} && git fetch origin && git reset --hard origin/${defaultBranch}`
        );
      }
    } catch {
      console.log(`[GitHub] Cloning repository to ${repoPath}`);
      const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      let cloneCommand = `git clone ${repoUrl} ${repoPath}`;

      if (ghToken) {
        const authenticatedUrl = `https://${ghToken}@github.com/${owner}/${repo}.git`;
        cloneCommand = `git clone ${authenticatedUrl} ${repoPath}`;
      }

      await execAsync(cloneCommand);
      await execAsync(`git config --global --add safe.directory '${repoPath}'`);
    }
  }

  /**
   * Auto-detect and load commands from .claude/commands or .agents/commands
   */
  private async autoDetectAndLoadCommands(repoPath: string, codebaseId: string): Promise<void> {
    const commandFolders = ['.claude/commands', '.agents/commands'];

    for (const folder of commandFolders) {
      try {
        const fullPath = join(repoPath, folder);
        await access(fullPath);

        const files = (await readdir(fullPath)).filter(f => f.endsWith('.md'));
        if (files.length === 0) continue;

        const commands = await codebaseDb.getCodebaseCommands(codebaseId);
        files.forEach(file => {
          commands[file.replace('.md', '')] = {
            path: join(folder, file),
            description: `From ${folder}`,
          };
        });

        await codebaseDb.updateCodebaseCommands(codebaseId, commands);
        console.log(`[GitHub] Loaded ${files.length} commands from ${folder}`);
        return;
      } catch {
        continue;
      }
    }
  }

  /**
   * Get or create codebase for repository
   * Returns: codebase record, path to use, and whether it's new
   */
  private async getOrCreateCodebaseForRepo(
    owner: string,
    repo: string
  ): Promise<{ codebase: { id: string; name: string }; repoPath: string; isNew: boolean }> {
    // Try both with and without .git suffix to match existing clones
    const repoUrlNoGit = `https://github.com/${owner}/${repo}`;
    const repoUrlWithGit = `${repoUrlNoGit}.git`;

    let existing = await codebaseDb.findCodebaseByRepoUrl(repoUrlNoGit);
    if (!existing) {
      existing = await codebaseDb.findCodebaseByRepoUrl(repoUrlWithGit);
    }

    if (existing) {
      console.log(`[GitHub] Using existing codebase: ${existing.name} at ${existing.default_cwd}`);
      return { codebase: existing, repoPath: existing.default_cwd, isNew: false };
    }

    // Use just the repo name (not owner-repo) to match /clone behavior
    const repoPath = `/workspace/${repo}`;
    const codebase = await codebaseDb.createCodebase({
      name: repo,
      repository_url: repoUrlNoGit, // Store without .git for consistency
      default_cwd: repoPath,
    });

    console.log(`[GitHub] Created new codebase: ${codebase.name} at ${repoPath}`);
    return { codebase, repoPath, isNew: true };
  }

  /**
   * Build context-rich message for issue
   */
  private buildIssueContext(issue: WebhookEvent['issue'], userComment: string): string {
    if (!issue) return userComment;
    const labels = issue.labels.map(l => l.name).join(', ');

    return `[GitHub Issue Context]
Issue #${issue.number}: "${issue.title}"
Author: ${issue.user.login}
Labels: ${labels}
Status: ${issue.state}

Description:
${issue.body}

---

${userComment}`;
  }

  /**
   * Build context-rich message for pull request
   */
  private buildPRContext(pr: WebhookEvent['pull_request'], userComment: string): string {
    if (!pr) return userComment;
    const stats = pr.changed_files
      ? `Changed files: ${pr.changed_files} (+${pr.additions}, -${pr.deletions})`
      : '';

    return `[GitHub Pull Request Context]
PR #${pr.number}: "${pr.title}"
Author: ${pr.user.login}
Status: ${pr.state}
${stats}

Description:
${pr.body}

Use 'gh pr diff ${pr.number}' to see detailed changes.

---

${userComment}`;
  }

  /**
   * Generate structured triage analysis using Codex
   */
  private async generateIssueTriage(issue: WebhookEvent['issue']): Promise<string> {
    if (!issue) return '';

    try {
      // Schema path
      const schemaPath = join(process.cwd(), 'src/schemas/issue-triage.json');
      await access(schemaPath); // Verify schema exists

      // Construct prompt
      const prompt = `Analyze this GitHub issue for triage.
Title: ${issue.title}
Body: ${issue.body || 'No description provided.'}

Provide technical assessment including severity, component, and estimated effort.`;

      // Escape quotes for command line
      const safePrompt = prompt.replace(/"/g, '\\"');
      
      console.log('[GitHub] Running Codex structured triage...');
      
      // Execute codex exec
      const { stdout } = await execAsync(
        `codex exec "${safePrompt}" --output-schema "${schemaPath}" --sandbox read-only`
      );

      // Parse JSON output
      const triage = JSON.parse(stdout) as TriageResult;
      
      // Format as markdown block
      return `
### 🤖 Codex Triage Analysis
- **Severity**: ${triage.severity.toUpperCase()}
- **Component**: \`${triage.component}\`
- **Effort**: ${triage.estimated_effort}
- **Suggested Labels**: ${triage.suggested_labels.join(', ')}

**Technical Summary**:
${triage.technical_summary}
`;
    } catch (error) {
      console.error('[GitHub] Triage generation failed:', error);
      return '\n> (Automated triage failed to generate)\n';
    }
  }


  /**
   * Ingest incoming webhook quickly and decide deterministic intake status.
   */
  async ingestWebhook(
    payload: string,
    signature: string,
    metadata: WebhookMetadata = {}
  ): Promise<WebhookIntakeResult> {
    if (!this.verifySignature(payload, signature)) {
      console.error('[GitHub] Invalid webhook signature');
      return {
        httpStatus: 401,
        body: { status: 'invalid_signature' },
        shouldProcess: false,
      };
    }

    let event: WebhookEvent;
    try {
      event = JSON.parse(payload) as WebhookEvent;
    } catch {
      return {
        httpStatus: 400,
        body: { status: 'invalid_payload' },
        shouldProcess: false,
      };
    }

    const parsed = this.parseEvent(event);
    if (!parsed) {
      return {
        httpStatus: 202,
        body: { status: 'ignored', reason: 'unsupported_event' },
        shouldProcess: false,
      };
    }

    const { owner, repo, number, comment, eventType, issue, pullRequest } = parsed;
    if (!this.hasMention(comment)) {
      return {
        httpStatus: 202,
        body: { status: 'ignored', reason: 'missing_mention' },
        shouldProcess: false,
      };
    }

    const conversationId = this.buildConversationId(owner, repo, number);
    const deliveryId = deriveWebhookDeliveryId(payload, metadata.deliveryId);
    const headSha = pullRequest?.head?.sha ?? null;
    const dedupeKey = buildWebhookDedupeKey({
      deliveryId,
      repositoryFullName: event.repository.full_name,
      objectType: eventType,
      objectNumber: number,
      action: event.action,
      headSha,
    });

    const strippedComment = this.stripMention(comment);
    const approveRunId = this.extractApproveRunId(strippedComment);
    if (approveRunId) {
      const actor = event.sender?.login;
      if (!actor) {
        return {
          httpStatus: 400,
          body: { status: 'approval_denied', reason: 'missing_actor' },
          shouldProcess: false,
        };
      }

      const canApprove = await this.isMaintainer(owner, repo, actor);
      if (!canApprove) {
        return {
          httpStatus: 403,
          body: { status: 'approval_denied', reason: 'maintainer_required', runId: approveRunId },
          shouldProcess: false,
        };
      }

      const approvedRun = await webhookDb.approveWebhookRun(approveRunId, actor);
      if (!approvedRun) {
        return {
          httpStatus: 404,
          body: { status: 'approval_not_found', runId: approveRunId },
          shouldProcess: false,
        };
      }

      return {
        httpStatus: 200,
        body: {
          status: 'approval_granted',
          runId: approvedRun.id,
          chainId: approvedRun.chain_id,
          approvedBy: actor,
        },
        shouldProcess: false,
      };
    }

    const pauseLoopCommand = this.extractPauseLoopCommand(strippedComment);
    const resumeLoopCommand = this.extractResumeLoopCommand(strippedComment);
    const overrideCooldownCommand = this.extractOverrideCooldownCommand(strippedComment);
    const overrideIterationCommand = this.extractOverrideIterationCommand(strippedComment);
    const overrideCircuitBreakerReason = this.extractOverrideCircuitBreakerReason(strippedComment);
    const mergeGateCommand = this.extractMergeGateCommand(strippedComment);
    const autoMergeCommand = this.extractAutoMergeCommand(strippedComment);
    if (
      pauseLoopCommand ||
      resumeLoopCommand ||
      overrideCooldownCommand ||
      overrideIterationCommand ||
      overrideCircuitBreakerReason ||
      mergeGateCommand ||
      autoMergeCommand
    ) {
      const actor = event.sender?.login;
      if (!actor) {
        return {
          httpStatus: 400,
          body: { status: 'control_denied', reason: 'missing_actor' },
          shouldProcess: false,
        };
      }
      const canControl = await this.isMaintainer(owner, repo, actor);
      if (!canControl) {
        return {
          httpStatus: 403,
          body: { status: 'control_denied', reason: 'maintainer_required' },
          shouldProcess: false,
        };
      }

      if (mergeGateCommand) {
        const gate = await this.evaluatePullRequestMergeGate(owner, repo, mergeGateCommand.pullNumber);
        return {
          httpStatus: 200,
          body: {
            status: gate.decision === 'allow' ? 'merge_gate_passed' : 'merge_gate_denied',
            action: 'merge_gate',
            pullNumber: mergeGateCommand.pullNumber,
            dryRun: mergeGateCommand.dryRun,
            decision: gate.decision,
            denyReasons: gate.denyReasons,
            missingRequiredChecks: gate.missingRequiredChecks,
            pendingChecks: gate.pendingChecks,
            failedChecks: gate.failedChecks,
            blockingReviewers: gate.blockingReviewers,
            mergeable: gate.mergeable,
            mergeableState: gate.mergeableState,
            requiredChecks: gate.requiredChecks,
          },
          shouldProcess: false,
        };
      }

      if (autoMergeCommand) {
        const gate = await this.evaluatePullRequestMergeGate(owner, repo, autoMergeCommand.pullNumber);
        const overrideApplied = gate.decision === 'deny' && Boolean(autoMergeCommand.overrideReason);
        const canMerge = gate.decision === 'allow' || overrideApplied;

        if (!canMerge) {
          return {
            httpStatus: 200,
            body: {
              status: 'merge_gate_denied',
              action: 'auto_merge',
              pullNumber: autoMergeCommand.pullNumber,
              dryRun: autoMergeCommand.dryRun,
              decision: gate.decision,
              denyReasons: gate.denyReasons,
              missingRequiredChecks: gate.missingRequiredChecks,
              pendingChecks: gate.pendingChecks,
              failedChecks: gate.failedChecks,
              blockingReviewers: gate.blockingReviewers,
              mergeable: gate.mergeable,
              mergeableState: gate.mergeableState,
              requiredChecks: gate.requiredChecks,
            },
            shouldProcess: false,
          };
        }

        if (overrideApplied && !autoMergeCommand.dryRun) {
          await webhookDb.recordRepositoryAutomationOverride({
            repositoryFullName: event.repository.full_name,
            action: 'override_merge_gate',
            actor,
            reason: autoMergeCommand.overrideReason ?? 'manual_override',
            metadata: {
              pullNumber: autoMergeCommand.pullNumber,
              denyReasons: gate.denyReasons,
            },
          });
        }

        if (autoMergeCommand.dryRun) {
          return {
            httpStatus: 200,
            body: {
              status: 'auto_merge_dry_run',
              action: 'auto_merge',
              pullNumber: autoMergeCommand.pullNumber,
              dryRun: true,
              decision: gate.decision,
              overrideApplied,
              denyReasons: gate.denyReasons,
            },
            shouldProcess: false,
          };
        }

        const mergeMethod = this.resolveMergeMethod();
        const mergeResponse = await this.octokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: autoMergeCommand.pullNumber,
          merge_method: mergeMethod,
          sha: gate.headSha,
        });
        return {
          httpStatus: mergeResponse.data.merged ? 200 : 409,
          body: {
            status: mergeResponse.data.merged ? 'auto_merged' : 'auto_merge_failed',
            action: 'auto_merge',
            pullNumber: autoMergeCommand.pullNumber,
            mergeMethod,
            merged: mergeResponse.data.merged,
            message: mergeResponse.data.message,
            sha: mergeResponse.data.sha ?? null,
            decision: gate.decision,
            overrideApplied,
            denyReasons: gate.denyReasons,
          },
          shouldProcess: false,
        };
      }

      if (pauseLoopCommand) {
        const pausedChain = await webhookDb.pauseWebhookChain(
          pauseLoopCommand.chainId,
          event.repository.full_name,
          actor,
          pauseLoopCommand.reason
        );
        if (!pausedChain) {
          return {
            httpStatus: 404,
            body: { status: 'control_not_found', action: 'pause_loop', chainId: pauseLoopCommand.chainId },
            shouldProcess: false,
          };
        }
        return {
          httpStatus: 200,
          body: {
            status: 'control_applied',
            action: 'pause_loop',
            chainId: pausedChain.id,
            actor,
          },
          shouldProcess: false,
        };
      }

      if (resumeLoopCommand) {
        const resumedChain = await webhookDb.resumeWebhookChain(
          resumeLoopCommand.chainId,
          event.repository.full_name,
          actor,
          resumeLoopCommand.reason
        );
        if (!resumedChain) {
          return {
            httpStatus: 404,
            body: { status: 'control_not_found', action: 'resume_loop', chainId: resumeLoopCommand.chainId },
            shouldProcess: false,
          };
        }
        return {
          httpStatus: 200,
          body: {
            status: 'control_applied',
            action: 'resume_loop',
            chainId: resumedChain.id,
            actor,
          },
          shouldProcess: false,
        };
      }

      if (overrideCooldownCommand) {
        const cooldownOverrideChain = await webhookDb.overrideWebhookChainCooldown(
          overrideCooldownCommand.chainId,
          event.repository.full_name,
          actor,
          overrideCooldownCommand.reason
        );
        if (!cooldownOverrideChain) {
          return {
            httpStatus: 404,
            body: {
              status: 'control_not_found',
              action: 'override_cooldown',
              chainId: overrideCooldownCommand.chainId,
            },
            shouldProcess: false,
          };
        }
        return {
          httpStatus: 200,
          body: {
            status: 'control_applied',
            action: 'override_cooldown',
            chainId: cooldownOverrideChain.id,
            actor,
          },
          shouldProcess: false,
        };
      }

      if (overrideIterationCommand) {
        const updatedChain = await webhookDb.overrideWebhookChainIterationBudget(
          overrideIterationCommand.chainId,
          event.repository.full_name,
          actor,
          overrideIterationCommand.reason
        );
        if (!updatedChain) {
          return {
            httpStatus: 404,
            body: {
              status: 'control_not_found',
              action: 'override_iteration_budget',
              chainId: overrideIterationCommand.chainId,
            },
            shouldProcess: false,
          };
        }
        return {
          httpStatus: 200,
          body: {
            status: 'control_applied',
            action: 'override_iteration_budget',
            chainId: updatedChain.id,
            actor,
          },
          shouldProcess: false,
        };
      }

      const breaker = await webhookDb.overrideRepositoryCircuitBreaker(
        event.repository.full_name,
        actor,
        overrideCircuitBreakerReason ?? 'manual_override'
      );
      return {
        httpStatus: 200,
        body: {
          status: 'control_applied',
          action: 'override_circuit_breaker',
          repository: event.repository.full_name,
          circuitBreakerStatus: breaker?.status ?? 'closed',
          actor,
        },
        shouldProcess: false,
      };
    }

    const isMutating = strippedComment.startsWith('/command-invoke');
    const targetBranch = pullRequest?.ref ?? event.repository.default_branch;
    const policy = evaluateWebhookPolicy({
      repositoryFullName: event.repository.full_name,
      targetBranch,
      commandText: strippedComment,
      isMutating,
    });

    const intake = await webhookDb.intakeWebhookRun({
      platformType: 'github',
      conversationId,
      repositoryFullName: event.repository.full_name,
      objectType: eventType,
      objectNumber: number,
      deliveryId,
      dedupeKey,
      eventType: metadata.eventName ?? eventType,
      action: event.action,
      headSha,
      isMutating,
      policyDecision: policy.decision,
      policyReason: policy.reason,
      riskTier: policy.riskTier,
    });

    if (intake.decision === 'deduped') {
      return {
        httpStatus: 200,
        body: { status: 'deduped', chainId: intake.chain.id, runId: intake.run?.id ?? null },
        shouldProcess: false,
      };
    }

    if (intake.decision === 'replay_inflight') {
      return {
        httpStatus: 202,
        body: {
          status: 'already_processing',
          chainId: intake.chain.id,
          runId: intake.run?.id ?? null,
        },
        shouldProcess: false,
      };
    }

    if (intake.decision === 'paused' || !intake.run) {
      return {
        httpStatus: 202,
        body: {
          status: 'paused',
          reason: intake.run?.reason ?? intake.reason ?? 'guardrail_triggered',
          riskTier: intake.run?.risk_tier ?? null,
          policyDecision: intake.run?.policy_decision ?? null,
          chainId: intake.chain.id,
          runId: intake.run?.id ?? null,
        },
        shouldProcess: false,
      };
    }

    if (intake.decision === 'blocked') {
      return {
        httpStatus: 202,
        body: {
          status: 'blocked_policy',
          reason: intake.reason ?? intake.run.reason ?? 'policy_blocked',
          riskTier: intake.run.risk_tier,
          policyDecision: intake.run.policy_decision,
          chainId: intake.chain.id,
          runId: intake.run.id,
        },
        shouldProcess: false,
      };
    }

    if (intake.decision === 'requires_approval') {
      return {
        httpStatus: 202,
        body: {
          status: 'requires_approval',
          reason: intake.reason ?? intake.run.reason ?? 'approval_required',
          riskTier: intake.run.risk_tier,
          policyDecision: intake.run.policy_decision,
          chainId: intake.chain.id,
          runId: intake.run.id,
        },
        shouldProcess: false,
      };
    }

    return {
      httpStatus: 202,
      body: {
        status: 'accepted',
        chainId: intake.chain.id,
        runId: intake.run.id,
        riskTier: intake.run.risk_tier,
        policyDecision: intake.run.policy_decision,
      },
      shouldProcess: true,
      context: {
        runId: intake.run.id,
        chainId: intake.chain.id,
        riskTier: intake.run.risk_tier ?? 'medium',
        event,
        parsed: {
          owner,
          repo,
          number,
          comment,
          eventType,
          issue,
          pullRequest,
        },
      },
    };
  }

  /**
   * Process an accepted webhook asynchronously.
   */
  async processWebhook(context: WebhookProcessContext): Promise<void> {
    const { runId, chainId, riskTier, parsed } = context;
    const { owner, repo, number, comment, eventType, issue, pullRequest } = parsed;
    const conversationId = this.buildConversationId(owner, repo, number);

    try {
      console.log(`[GitHub] Processing ${eventType}: ${owner}/${repo}#${String(number)}`);

      const existingConv = await db.getOrCreateConversation('github', conversationId);
      const isNewConversation = !existingConv.codebase_id;

      const { codebase, repoPath, isNew: isNewCodebase } = await this.getOrCreateCodebaseForRepo(
        owner,
        repo
      );

      const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;
      await this.ensureRepoReady(owner, repo, defaultBranch, repoPath, isNewConversation);

      if (isNewCodebase) {
        await this.autoDetectAndLoadCommands(repoPath, codebase.id);
      }

      if (isNewConversation) {
        await db.updateConversation(existingConv.id, {
          codebase_id: codebase.id,
          cwd: repoPath,
        });
      }

      const strippedComment = this.stripMention(comment);
      let finalMessage = strippedComment;
      let contextToAppend: string | undefined;

      const isSlashCommand = strippedComment.trim().startsWith('/');
      const isCommandInvoke = strippedComment.trim().startsWith('/command-invoke');

      if (isSlashCommand) {
        const firstLine = strippedComment.split('\n')[0].trim();
        finalMessage = firstLine;
        console.log(`[GitHub] Processing slash command: ${firstLine}`);

        if (isCommandInvoke) {
          const activeSession = await sessionDb.getActiveSession(existingConv.id);
          const isFirstCommandInvoke = !activeSession;

          if (isFirstCommandInvoke) {
            console.log('[GitHub] Adding issue/PR reference for first /command-invoke');
            if (eventType === 'issue' && issue) {
              contextToAppend = `GitHub Issue #${String(issue.number)}: "${issue.title}"
Use 'gh issue view ${String(issue.number)}' for full details if needed.`;
            } else if (eventType === 'issue_comment' && issue) {
              contextToAppend = `GitHub Issue #${String(issue.number)}: "${issue.title}"
Use 'gh issue view ${String(issue.number)}' for full details if needed.`;
            } else if (eventType === 'pull_request' && pullRequest) {
              contextToAppend = `GitHub Pull Request #${String(pullRequest.number)}: "${pullRequest.title}"
Use 'gh pr view ${String(pullRequest.number)}' for full details if needed.`;
            } else if (eventType === 'issue_comment' && pullRequest) {
              contextToAppend = `GitHub Pull Request #${String(pullRequest.number)}: "${pullRequest.title}"
Use 'gh pr view ${String(pullRequest.number)}' for full details if needed.`;
            }
          }
        }
      } else if (isNewConversation) {
        if (eventType === 'issue' && issue) {
          const triageAnalysis = await this.generateIssueTriage(issue);
          finalMessage = this.buildIssueContext(issue, strippedComment);
          if (triageAnalysis) {
            finalMessage += `

---${triageAnalysis}`;
          }
        } else if (eventType === 'issue_comment' && issue) {
          finalMessage = this.buildIssueContext(issue, strippedComment);
        } else if (eventType === 'pull_request' && pullRequest) {
          finalMessage = this.buildPRContext(pullRequest, strippedComment);
        } else if (eventType === 'issue_comment' && pullRequest) {
          finalMessage = this.buildPRContext(pullRequest, strippedComment);
        }
      }

      await handleMessage(this, conversationId, finalMessage, contextToAppend, [], {
        errorStrategy: 'throw',
      });
      await webhookDb.finalizeWebhookRun(runId, 'executed');
    } catch (error) {
      console.error('[GitHub] Message handling error:', error);
      const message = error instanceof Error ? error.message : String(error);
      const retryPolicy = evaluateAutonomousRetryPolicy({
        riskTier,
        repeatedFailureCount: 1,
      });
      const failure = await webhookDb.registerWebhookFailure(
        chainId,
        runId,
        message,
        retryPolicy.maxAttempts
      );
      const retryDecision = evaluateAutonomousRetryPolicy({
        riskTier,
        repeatedFailureCount: failure.repeatedFailureCount,
      });
      try {
        if (retryDecision.shouldRetry && !retryDecision.shouldPause) {
          const { baseSeconds, maxJitterSeconds } = resolveRetryCooldownSeconds();
          const cooldownUntil = computeRetryCooldownUntil({
            now: new Date(),
            baseSeconds,
            maxJitterSeconds,
            seed: `${chainId}:${runId}:${String(failure.repeatedFailureCount)}`,
          });
          await webhookDb.setWebhookChainCooldown(chainId, cooldownUntil);
          await webhookDb.addWebhookRunEvent({
            runId,
            chainId,
            eventType: 'retry_scheduled',
            status: 'blocked_policy',
            message: `Retry scheduled after failure ${String(failure.repeatedFailureCount)} of ${String(retryDecision.maxAttempts)}.`,
            metadata: {
              reason: retryDecision.reason,
              riskTier,
              repeatedFailureCount: failure.repeatedFailureCount,
              maxAttempts: retryDecision.maxAttempts,
              cooldownUntil: cooldownUntil.toISOString(),
              baseCooldownSeconds: baseSeconds,
              maxJitterSeconds,
            },
          });
        } else {
          const exhaustedReason = failure.circuitBreakerTripped
            ? WEBHOOK_RUN_REASONS.CIRCUIT_BREAKER_TRIPPED
            : retryDecision.reason;
          await webhookDb.addWebhookRunEvent({
            runId,
            chainId,
            eventType: 'retry_exhausted',
            status: 'paused',
            message: `Retry budget exhausted after ${String(failure.repeatedFailureCount)} failures.`,
            metadata: {
              reason: exhaustedReason,
              riskTier,
              repeatedFailureCount: failure.repeatedFailureCount,
              maxAttempts: retryDecision.maxAttempts,
              circuitBreakerTripped: failure.circuitBreakerTripped,
            },
          });
        }
      } catch (controlPlaneError) {
        console.warn('[GitHub] Failed to update retry control-plane metadata:', controlPlaneError);
      }
      const finalReason = failure.circuitBreakerTripped
        ? WEBHOOK_RUN_REASONS.CIRCUIT_BREAKER_TRIPPED
        : retryDecision.shouldPause
          ? WEBHOOK_RUN_REASONS.RETRY_EXHAUSTED
          : WEBHOOK_RUN_REASONS.RETRY_SCHEDULED;
      await webhookDb.finalizeWebhookRun(
        runId,
        retryDecision.shouldPause || failure.circuitBreakerTripped ? 'paused' : 'blocked_policy',
        finalReason
      );
      await this.sendMessage(conversationId, 'Warning: an error occurred. Please try again or use /reset.');
    }
  }
}
