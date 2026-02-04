import { createHash, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  finalizeWebhookRun,
  getWebhookMetrics,
  intakeWebhookRun,
  listRecentWebhookRuns,
  registerWebhookFailure,
} from '../db/webhook-control-plane';
import { buildWebhookDedupeKey } from '../utils/webhook-control-plane';
import { evaluateWebhookPolicy, type WebhookPolicyResult } from '../utils/webhook-policy';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

interface OpenClawBridgePayload {
  eventId: string;
  conversationId: string;
  repositoryFullName: string;
  targetBranch?: string;
  command: string;
}

interface OpenClawStatusSummary {
  command: string;
  totalRuns: number;
  executedRuns: number;
  blockedRuns: number;
  approvalRequiredRuns: number;
  recentRuns: {
    id: string;
    status: string;
    reason: string | null;
    created_at: Date;
  }[];
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function getOpenClawAllowedCommands(): string[] {
  return parseCsv(process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS, ['/status']);
}

function toDeterministicObjectNumber(conversationId: string): number {
  const hash = createHash('sha256').update(conversationId).digest('hex').slice(0, 8);
  const parsed = Number.parseInt(hash, 16);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return (parsed % 2_000_000_000) + 1;
}

function parsePayload(req: Request): OpenClawBridgePayload | null {
  const body = req.body as Partial<OpenClawBridgePayload>;
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const repositoryFullName =
    typeof body.repositoryFullName === 'string' ? body.repositoryFullName.trim() : '';
  const targetBranchRaw =
    typeof body.targetBranch === 'string' ? body.targetBranch.trim() : '';
  const targetBranch = targetBranchRaw || undefined;
  const command = typeof body.command === 'string' ? body.command.trim() : '';

  if (!eventId || !conversationId || !repositoryFullName || !command) {
    return null;
  }

  return {
    eventId,
    conversationId,
    repositoryFullName,
    targetBranch,
    command,
  };
}

function extractCommandToken(command: string): string {
  return command.split(/\s+/)[0]?.toLowerCase() ?? '';
}

function buildPolicy(
  payload: OpenClawBridgePayload,
  commandToken: string,
  allowedCommands: string[]
): WebhookPolicyResult {
  if (!allowedCommands.includes(commandToken)) {
    return {
      decision: 'blocked',
      reason: 'command_not_allowed',
      riskTier: 'low',
    };
  }

  return evaluateWebhookPolicy({
    repositoryFullName: payload.repositoryFullName,
    targetBranch: payload.targetBranch ?? 'stable',
    commandText: payload.command,
    isMutating: false,
  });
}

async function executeStatusReport(command: string): Promise<OpenClawStatusSummary> {
  const [metrics, recentRuns] = await Promise.all([
    getWebhookMetrics('openclaw'),
    listRecentWebhookRuns(5, 'openclaw'),
  ]);

  return {
    command,
    totalRuns: metrics.totals.totalRuns,
    executedRuns: metrics.totals.executedRuns,
    blockedRuns: metrics.totals.blockedRuns,
    approvalRequiredRuns: metrics.totals.approvalRequiredRuns,
    recentRuns: recentRuns.map(run => ({
      id: run.id,
      status: run.status,
      reason: run.reason,
      created_at: run.created_at,
    })),
  };
}

/**
 * POST /webhooks/openclaw/bridge
 * Constrained OpenClaw interoperability PoC endpoint.
 */
export async function postOpenClawBridgeHandler(req: Request, res: Response): Promise<void> {
  const configuredSecret = process.env.OPENCLAW_BRIDGE_SHARED_SECRET?.trim();
  if (!configuredSecret) {
    res.status(503).json({ error: 'OpenClaw bridge not configured' });
    return;
  }

  const providedSecret = req.header('x-openclaw-shared-secret')?.trim();
  if (!providedSecret) {
    res.status(401).json({ status: 'invalid_secret' });
    return;
  }
  const providedBuffer = Buffer.from(providedSecret, 'utf8');
  const configuredBuffer = Buffer.from(configuredSecret, 'utf8');
  const maxLength = Math.max(providedBuffer.length, configuredBuffer.length);
  const paddedProvided = Buffer.alloc(maxLength);
  const paddedConfigured = Buffer.alloc(maxLength);
  providedBuffer.copy(paddedProvided);
  configuredBuffer.copy(paddedConfigured);
  if (!timingSafeEqual(paddedProvided, paddedConfigured)) {
    res.status(401).json({ status: 'invalid_secret' });
    return;
  }

  const payload = parsePayload(req);
  if (!payload) {
    res.status(400).json({ error: 'Invalid payload for OpenClaw bridge command' });
    return;
  }

  const commandToken = extractCommandToken(payload.command);
  const allowedCommands = getOpenClawAllowedCommands();
  const policy = buildPolicy(payload, commandToken, allowedCommands);

  const objectNumber = toDeterministicObjectNumber(payload.conversationId);
  const dedupeKey = buildWebhookDedupeKey({
    deliveryId: payload.eventId,
    repositoryFullName: payload.repositoryFullName,
    objectType: 'openclaw_bridge',
    objectNumber,
    action: commandToken,
    headSha: null,
  });

  const intake = await intakeWebhookRun({
    platformType: 'openclaw',
    conversationId: payload.conversationId,
    repositoryFullName: payload.repositoryFullName,
    objectType: 'openclaw_bridge',
    objectNumber,
    deliveryId: payload.eventId,
    dedupeKey,
    eventType: 'openclaw.bridge.command',
    action: commandToken,
    headSha: null,
    isMutating: false,
    policyDecision: policy.decision,
    policyReason: policy.reason,
    riskTier: policy.riskTier,
  });

  if (intake.decision === 'deduped') {
    res.status(200).json({
      status: 'deduped',
      eventId: payload.eventId,
      runId: intake.run?.id ?? null,
      chainId: intake.chain.id,
    });
    return;
  }

  if (intake.decision === 'replay_inflight') {
    res.status(202).json({
      status: 'already_processing',
      eventId: payload.eventId,
      runId: intake.run?.id ?? null,
      chainId: intake.chain.id,
    });
    return;
  }

  if (intake.decision === 'paused' || !intake.run) {
    res.status(202).json({
      status: 'paused',
      eventId: payload.eventId,
      runId: intake.run?.id ?? null,
      chainId: intake.chain.id,
      reason: intake.run?.reason ?? intake.reason ?? 'guardrail_triggered',
    });
    return;
  }

  if (intake.decision === 'blocked') {
    res.status(202).json({
      status: 'blocked_policy',
      eventId: payload.eventId,
      runId: intake.run.id,
      chainId: intake.chain.id,
      reason: intake.reason ?? intake.run.reason ?? 'policy_blocked',
    });
    return;
  }

  if (intake.decision === 'requires_approval') {
    res.status(202).json({
      status: 'requires_approval',
      eventId: payload.eventId,
      runId: intake.run.id,
      chainId: intake.chain.id,
      reason: intake.reason ?? intake.run.reason ?? 'approval_required',
    });
    return;
  }

  const runId = intake.run.id;
  const chainId = intake.chain.id;

  try {
    if (!allowedCommands.includes(commandToken)) {
      throw new Error(`Command not allowlisted: ${commandToken}`);
    }

    if (commandToken === '/status') {
      const summary = await executeStatusReport(commandToken);
      await finalizeWebhookRun(runId, 'executed', 'openclaw_status_report');

      res.status(200).json({
        status: 'executed',
        eventId: payload.eventId,
        runId,
        chainId,
        result: summary,
      });
      return;
    }

    throw new Error(
      `Command "${commandToken}" is allowlisted by OPENCLAW_BRIDGE_ALLOWED_COMMANDS but not implemented`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const publicError = 'execution_failed';
    await registerWebhookFailure(chainId, runId, message);
    await finalizeWebhookRun(runId, 'paused', 'openclaw_bridge_error');

    res.status(500).json({
      status: 'execution_failed',
      eventId: payload.eventId,
      runId,
      chainId,
      error: publicError,
    });
    return;
  }
}

router.post('/openclaw/bridge', asyncHandler(postOpenClawBridgeHandler));

export default router;
