import { createHash, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  finalizeWebhookRun,
  getWebhookMetrics,
  intakeWebhookRun,
  listRecentWebhookRuns,
  listWebhookRunEvents,
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

type OpenClawCommandCapability = 'read_only' | 'needs_approval' | 'mutating';

interface OpenClawCommandDefinition {
  token: string;
  capability: OpenClawCommandCapability;
  execute?: (context: OpenClawCommandContext) => Promise<unknown>;
}

interface OpenClawCommandContext {
  commandToken: string;
  args: string[];
}

class UnsupportedOpenClawCommandError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UnsupportedOpenClawCommandError';
  }
}

class OpenClawValidationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'OpenClawValidationError';
  }
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
  return parseCsv(process.env.OPENCLAW_BRIDGE_ALLOWED_COMMANDS, ['/status', '/metrics', '/runs', '/events']);
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

function parseCommandParts(command: string): { token: string; args: string[] } {
  const parts = command
    .trim()
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const [token = '', ...args] = parts;
  return {
    token: token.toLowerCase(),
    args,
  };
}

function parseOptionalLimit(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function getOpenClawCommandRegistry(): Map<string, OpenClawCommandDefinition> {
  const registry: OpenClawCommandDefinition[] = [
    {
      token: '/status',
      capability: 'read_only',
      execute: async ({ commandToken }) => executeStatusReport(commandToken),
    },
    {
      token: '/metrics',
      capability: 'read_only',
      execute: async () => getWebhookMetrics('openclaw'),
    },
    {
      token: '/runs',
      capability: 'read_only',
      execute: async ({ args }): Promise<unknown> => {
        const limit = parseOptionalLimit(args[0], 10, 50);
        const runs = await listRecentWebhookRuns({ limit, platformType: 'openclaw' });
        return runs.map(run => ({
          id: run.id,
          status: run.status,
          reason: run.reason,
          created_at: run.created_at,
          repository_full_name: run.repository_full_name ?? null,
        }));
      },
    },
    {
      token: '/events',
      capability: 'read_only',
      execute: async ({ args }): Promise<unknown> => {
        const runId = args[0]?.trim();
        if (!runId) {
          throw new OpenClawValidationError('Command "/events" requires <runId> argument');
        }
        const limit = parseOptionalLimit(args[1], 20, 200);
        const events = await listWebhookRunEvents(runId, limit);
        return events.map(event => ({
          id: event.id,
          event_type: event.event_type,
          status: event.status,
          message: event.message,
          created_at: event.created_at,
        }));
      },
    },
    {
      token: '/execute',
      capability: 'mutating',
    },
  ];
  return new Map(registry.map(definition => [definition.token, definition]));
}

function getEnabledCommandDefinitions(): Map<string, OpenClawCommandDefinition> {
  const allowed = new Set(getOpenClawAllowedCommands().map(command => command.toLowerCase()));
  const registry = getOpenClawCommandRegistry();
  const enabled = new Map<string, OpenClawCommandDefinition>();
  for (const [token, definition] of registry.entries()) {
    if (allowed.has(token)) {
      enabled.set(token, definition);
    }
  }
  return enabled;
}

function isMutatingCapability(capability: OpenClawCommandCapability): boolean {
  return capability === 'mutating';
}

function buildPolicy(
  payload: OpenClawBridgePayload,
  commandDefinition: OpenClawCommandDefinition | undefined
): WebhookPolicyResult {
  if (!commandDefinition) {
    return {
      decision: 'blocked',
      reason: 'command_not_allowed',
      riskTier: 'low',
    };
  }

  const policy = evaluateWebhookPolicy({
    repositoryFullName: payload.repositoryFullName,
    targetBranch: payload.targetBranch ?? 'stable',
    commandText: payload.command,
    isMutating: isMutatingCapability(commandDefinition.capability),
  });

  if (commandDefinition.capability === 'needs_approval' && policy.decision === 'allow') {
    return {
      decision: 'requires_approval',
      reason: 'medium_risk_requires_approval',
      riskTier: policy.riskTier === 'high' ? 'high' : 'medium',
    };
  }

  return policy;
}

async function executeStatusReport(command: string): Promise<OpenClawStatusSummary> {
  const [metrics, recentRuns] = await Promise.all([
    getWebhookMetrics('openclaw'),
    listRecentWebhookRuns({ limit: 5, platformType: 'openclaw' }),
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

  const parsedCommand = parseCommandParts(payload.command);
  const commandToken = parsedCommand.token;
  const enabledCommandDefinitions = getEnabledCommandDefinitions();
  const commandDefinition = enabledCommandDefinitions.get(commandToken);
  const policy = buildPolicy(payload, commandDefinition);

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
    isMutating: commandDefinition ? isMutatingCapability(commandDefinition.capability) : false,
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
    if (!commandDefinition) {
      throw new UnsupportedOpenClawCommandError(`Command "${commandToken}" is not enabled`);
    }
    if (!commandDefinition.execute) {
      throw new UnsupportedOpenClawCommandError(
        `Command "${commandToken}" is allowlisted but not implemented`
      );
    }

    const result = await commandDefinition.execute({
      commandToken,
      args: parsedCommand.args,
    });
    await finalizeWebhookRun(runId, 'executed', 'openclaw_command_executed');
    res.status(200).json({
      status: 'executed',
      eventId: payload.eventId,
      runId,
      chainId,
      command: commandToken,
      result,
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidation = error instanceof OpenClawValidationError;
    const isUnsupported = error instanceof UnsupportedOpenClawCommandError;
    const publicError = isValidation
      ? 'invalid_command_arguments'
      : isUnsupported
        ? 'unsupported_command'
        : 'execution_failed';
    await registerWebhookFailure(chainId, runId, message);
    await finalizeWebhookRun(
      runId,
      'paused',
      isValidation || isUnsupported ? 'command_not_allowed' : 'openclaw_bridge_error'
    );

    res.status(isValidation ? 400 : isUnsupported ? 501 : 500).json({
      status: publicError,
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
