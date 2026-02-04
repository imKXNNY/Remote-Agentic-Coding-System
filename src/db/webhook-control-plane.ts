import { pool } from './connection';
import {
  WebhookRunStatus,
  buildFailureSignature,
  evaluateWebhookGuardrails,
  isTerminalWebhookRunStatus,
} from '../utils/webhook-control-plane';
import { WebhookPolicyDecision, WebhookPolicyReason, WebhookRiskTier } from '../utils/webhook-policy';

export interface WebhookChain {
  id: string;
  platform_type: string;
  conversation_id: string;
  repository_full_name: string;
  object_type: string;
  object_number: number;
  status: 'active' | 'paused';
  iteration_count: number;
  iteration_window_started_at: Date;
  cooldown_until: Date | null;
  last_failure_signature: string | null;
  repeated_failure_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookRun {
  id: string;
  chain_id: string;
  delivery_id: string;
  dedupe_key: string;
  event_type: string;
  action: string | null;
  head_sha: string | null;
  status: WebhookRunStatus;
  reason: string | null;
  is_mutating: boolean;
  failure_signature: string | null;
  risk_tier: WebhookRiskTier | null;
  policy_decision: WebhookPolicyDecision | null;
  policy_reason: WebhookPolicyReason | null;
  approved_by: string | null;
  approved_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface WebhookRunEvent {
  id: string;
  run_id: string;
  chain_id: string;
  event_type: string;
  status: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface WebhookMetrics {
  statusCounts: Record<string, number>;
  totals: {
    totalRuns: number;
    dedupedRuns: number;
    pausedRuns: number;
    approvalRequiredRuns: number;
    blockedRuns: number;
    executedRuns: number;
  };
  durationSeconds: {
    avg: number;
    p95: number;
  };
}

interface IntakeWebhookRunInput {
  platformType: 'github' | 'openclaw';
  conversationId: string;
  repositoryFullName: string;
  objectType: string;
  objectNumber: number;
  deliveryId: string;
  dedupeKey: string;
  eventType: string;
  action: string;
  headSha?: string | null;
  isMutating: boolean;
  policyDecision: WebhookPolicyDecision;
  policyReason: WebhookPolicyReason;
  riskTier: WebhookRiskTier;
}

interface IntakeDecision {
  decision: 'accepted' | 'deduped' | 'replay_inflight' | 'paused' | 'requires_approval' | 'blocked';
  run: WebhookRun | null;
  chain: WebhookChain;
  reason?: string;
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const MAX_ITERATIONS_PER_CHAIN = parseEnvInt('WEBHOOK_MAX_ITERATIONS_PER_CHAIN', 3);
const MAX_MUTATING_RUNS_24H = parseEnvInt('WEBHOOK_MAX_MUTATING_RUNS_24H', 5);
const COOLDOWN_MINUTES = parseEnvInt('WEBHOOK_MUTATION_COOLDOWN_MINUTES', 10);

export async function intakeWebhookRun(input: IntakeWebhookRunInput): Promise<IntakeDecision> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const chain = await upsertChain(client, input);
    const lockedChainResult = await client.query<WebhookChain>(
      `SELECT *
       FROM remote_agent_automation_chains
       WHERE id = $1
       FOR UPDATE`,
      [chain.id]
    );
    const lockedChain = lockedChainResult.rows[0];
    if (!lockedChain) {
      throw new Error(`Webhook chain not found after upsert: ${chain.id}`);
    }
    const chainAfterWindowReset = await maybeResetIterationWindow(client, lockedChain);

    const existingDedupe = await findExistingDedupeRun(client, input.dedupeKey);
    if (existingDedupe) {
      await client.query('COMMIT');

      return {
        decision: isTerminalWebhookRunStatus(existingDedupe.status) ? 'deduped' : 'replay_inflight',
        run: existingDedupe,
        chain: chainAfterWindowReset,
      };
    }

    const mutatingRuns24hResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM remote_agent_automation_runs
       WHERE chain_id = $1
         AND is_mutating = TRUE
         AND created_at > NOW() - INTERVAL '24 hours'
         AND status IN ('accepted', 'executed')`,
      [chainAfterWindowReset.id]
    );
    const mutatingRuns24h = Number.parseInt(mutatingRuns24hResult.rows[0]?.count ?? '0', 10);

    const guardrail = evaluateWebhookGuardrails({
      chainStatus: chainAfterWindowReset.status,
      isMutating: input.isMutating,
      now: new Date(),
      cooldownUntil: chainAfterWindowReset.cooldown_until,
      iterationCount: chainAfterWindowReset.iteration_count,
      maxIterations: MAX_ITERATIONS_PER_CHAIN,
      mutatingRuns24h,
      maxMutatingRuns24h: MAX_MUTATING_RUNS_24H,
    });

    if (!guardrail.allowed) {
      const pausedRun = await insertRun(client, {
        chainId: chainAfterWindowReset.id,
        deliveryId: input.deliveryId,
        dedupeKey: input.dedupeKey,
        eventType: input.eventType,
        action: input.action,
        headSha: input.headSha ?? null,
        status: 'paused',
        reason: guardrail.reason,
        isMutating: input.isMutating,
        riskTier: input.riskTier,
        policyDecision: input.policyDecision,
        policyReason: input.policyReason,
      });
      if (!pausedRun) {
        const replay = await findExistingDedupeRun(client, input.dedupeKey);
        if (replay) {
          await client.query('COMMIT');
          return {
            decision: isTerminalWebhookRunStatus(replay.status) ? 'deduped' : 'replay_inflight',
            run: replay,
            chain: chainAfterWindowReset,
          };
        }
        throw new Error('Failed to insert paused webhook run and no existing dedupe run found');
      }

      const shouldPauseChain = guardrail.reason === 'chain_paused';
      if (shouldPauseChain) {
        await client.query(
          `UPDATE remote_agent_automation_chains
           SET status = 'paused',
               updated_at = NOW()
           WHERE id = $1`,
          [chainAfterWindowReset.id]
        );
      }

      await client.query('COMMIT');
      return {
        decision: 'paused',
        run: pausedRun,
        chain: shouldPauseChain ? { ...chainAfterWindowReset, status: 'paused' } : chainAfterWindowReset,
      };
    }

    if (input.policyDecision === 'blocked') {
      const blockedRun = await insertRun(client, {
        chainId: chainAfterWindowReset.id,
        deliveryId: input.deliveryId,
        dedupeKey: input.dedupeKey,
        eventType: input.eventType,
        action: input.action,
        headSha: input.headSha ?? null,
        status: 'blocked_policy',
        reason: input.policyReason,
        isMutating: input.isMutating,
        riskTier: input.riskTier,
        policyDecision: input.policyDecision,
        policyReason: input.policyReason,
      });
      if (!blockedRun) {
        const replay = await findExistingDedupeRun(client, input.dedupeKey);
        if (replay) {
          await client.query('COMMIT');
          return {
            decision: isTerminalWebhookRunStatus(replay.status) ? 'deduped' : 'replay_inflight',
            run: replay,
            chain: chainAfterWindowReset,
          };
        }
        throw new Error('Failed to insert blocked webhook run and no existing dedupe run found');
      }
      await client.query('COMMIT');
      return { decision: 'blocked', run: blockedRun, chain: chainAfterWindowReset, reason: input.policyReason };
    }

    if (input.policyDecision === 'requires_approval') {
      const approvalRun = await insertRun(client, {
        chainId: chainAfterWindowReset.id,
        deliveryId: input.deliveryId,
        dedupeKey: input.dedupeKey,
        eventType: input.eventType,
        action: input.action,
        headSha: input.headSha ?? null,
        status: 'requires_approval',
        reason: input.policyReason,
        isMutating: input.isMutating,
        riskTier: input.riskTier,
        policyDecision: input.policyDecision,
        policyReason: input.policyReason,
      });
      if (!approvalRun) {
        const replay = await findExistingDedupeRun(client, input.dedupeKey);
        if (replay) {
          await client.query('COMMIT');
          return {
            decision: isTerminalWebhookRunStatus(replay.status) ? 'deduped' : 'replay_inflight',
            run: replay,
            chain: chainAfterWindowReset,
          };
        }
        throw new Error('Failed to insert approval webhook run and no existing dedupe run found');
      }
      await client.query('COMMIT');
      return {
        decision: 'requires_approval',
        run: approvalRun,
        chain: chainAfterWindowReset,
        reason: input.policyReason,
      };
    }

    const acceptedRun = await insertRun(client, {
      chainId: chainAfterWindowReset.id,
      deliveryId: input.deliveryId,
      dedupeKey: input.dedupeKey,
      eventType: input.eventType,
      action: input.action,
      headSha: input.headSha ?? null,
      status: 'accepted',
      reason: null,
      isMutating: input.isMutating,
      riskTier: input.riskTier,
      policyDecision: input.policyDecision,
      policyReason: input.policyReason,
    });
    if (!acceptedRun) {
      const replay = await findExistingDedupeRun(client, input.dedupeKey);
      if (replay) {
        await client.query('COMMIT');
        return {
          decision: isTerminalWebhookRunStatus(replay.status) ? 'deduped' : 'replay_inflight',
          run: replay,
          chain: chainAfterWindowReset,
        };
      }
      throw new Error('Failed to insert accepted webhook run and no existing dedupe run found');
    }

    const updatedChainResult = await client.query<WebhookChain>(
      `UPDATE remote_agent_automation_chains
       SET iteration_count = iteration_count + 1,
           cooldown_until = CASE
             WHEN $2::boolean THEN NOW() + (($3::text || ' minutes')::interval)
             ELSE cooldown_until
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chainAfterWindowReset.id, input.isMutating, String(COOLDOWN_MINUTES)]
    );

    await client.query('COMMIT');
    return { decision: 'accepted', run: acceptedRun, chain: updatedChainResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeWebhookRun(
  runId: string,
  status: Exclude<WebhookRunStatus, 'deduped' | 'requires_approval'>,
  reason?: string
): Promise<void> {
  const runResult = await pool.query<WebhookRun>(
    `UPDATE remote_agent_automation_runs
     SET status = $2,
         reason = COALESCE($3, reason),
         finished_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [runId, status, reason ?? null]
  );

  const run = runResult.rows[0];
  if (!run) {
    return;
  }

  if (status === 'paused') {
    await pool.query(
      `UPDATE remote_agent_automation_chains
       SET status = 'paused',
           updated_at = NOW()
       WHERE id = $1`,
      [run.chain_id]
    );
  }

  await safeEmitRunEvent(pool, {
    runId: run.id,
    chainId: run.chain_id,
    eventType: 'run_finalized',
    status,
    message: reason ?? null,
    metadata: {
      policyDecision: run.policy_decision,
      riskTier: run.risk_tier,
    },
  });
}

export async function registerWebhookFailure(
  chainId: string,
  runId: string,
  errorMessage: string,
  maxFailuresBeforePause = 2
): Promise<{ shouldPause: boolean; failureSignature: string; repeatedFailureCount: number }> {
  const signature = buildFailureSignature(errorMessage, 1, []);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const chainUpdate = await client.query<{ repeated_failure_count: number }>(
      `UPDATE remote_agent_automation_chains
       SET last_failure_signature = $2,
           repeated_failure_count = CASE
             WHEN last_failure_signature = $2 THEN repeated_failure_count + 1
             ELSE 1
           END,
           status = CASE
             WHEN (
               CASE
                 WHEN last_failure_signature = $2 THEN repeated_failure_count + 1
                 ELSE 1
               END
             ) >= $3
               THEN 'paused'
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING repeated_failure_count`,
      [chainId, signature, maxFailuresBeforePause]
    );

    await client.query(
      `UPDATE remote_agent_automation_runs
       SET failure_signature = $2
       WHERE id = $1`,
      [runId, signature]
    );

    await safeEmitRunEvent(client, {
      runId,
      chainId,
      eventType: 'failure_registered',
      status: null,
      message: 'Failure signature recorded',
      metadata: {
        failureSignature: signature,
      },
    });

    await client.query('COMMIT');

    const repeatCount = chainUpdate.rows[0]?.repeated_failure_count ?? 1;
    return {
      shouldPause: repeatCount >= maxFailuresBeforePause,
      failureSignature: signature,
      repeatedFailureCount: repeatCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRecentWebhookRuns(
  limit = 50,
  platformType?: string
): Promise<WebhookRun[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const result = platformType
    ? await pool.query<WebhookRun>(
        `SELECT r.*
         FROM remote_agent_automation_runs r
         INNER JOIN remote_agent_automation_chains c ON c.id = r.chain_id
         WHERE c.platform_type = $1
         ORDER BY r.created_at DESC
         LIMIT $2`,
        [platformType, safeLimit]
      )
    : await pool.query<WebhookRun>(
        `SELECT r.*
         FROM remote_agent_automation_runs r
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [safeLimit]
      );
  return result.rows;
}

export async function listWebhookRunEvents(runId: string, limit = 200): Promise<WebhookRunEvent[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const result = await pool.query<WebhookRunEvent>(
    `SELECT *
     FROM remote_agent_automation_run_events
     WHERE run_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [runId, safeLimit]
  );
  return result.rows;
}

export async function getWebhookMetrics(platformType?: string): Promise<WebhookMetrics> {
  const params: string[] = [];
  const joinClause = platformType
    ? 'INNER JOIN remote_agent_automation_chains c ON c.id = r.chain_id'
    : '';
  const whereClause = platformType ? 'WHERE c.platform_type = $1' : '';
  if (platformType) {
    params.push(platformType);
  }

  const statusCountsResult = await pool.query<{ status: string; count: string }>(
    `SELECT r.status, COUNT(*)::text AS count
     FROM remote_agent_automation_runs r
     ${joinClause}
     ${whereClause}
     GROUP BY r.status`,
    params
  );

  const durationResult = await pool.query<{ avg_seconds: string | null; p95_seconds: string | null }>(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)))::text AS avg_seconds,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.finished_at - r.started_at)))::text AS p95_seconds
     FROM remote_agent_automation_runs r
     ${joinClause}
     ${whereClause ? `${whereClause} AND` : 'WHERE'} r.started_at IS NOT NULL
       AND r.finished_at IS NOT NULL`,
    params
  );

  const statusCounts = statusCountsResult.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = Number.parseInt(row.count, 10);
    return acc;
  }, {});

  const parseMetric = (value: string | null | undefined): number =>
    value ? Number.parseFloat(value) : 0;

  return {
    statusCounts,
    totals: {
      totalRuns: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      dedupedRuns: statusCounts.deduped ?? 0,
      pausedRuns: statusCounts.paused ?? 0,
      approvalRequiredRuns: statusCounts.requires_approval ?? 0,
      blockedRuns: statusCounts.blocked_policy ?? 0,
      executedRuns: statusCounts.executed ?? 0,
    },
    durationSeconds: {
      avg: parseMetric(durationResult.rows[0]?.avg_seconds),
      p95: parseMetric(durationResult.rows[0]?.p95_seconds),
    },
  };
}

export async function approveWebhookRun(runId: string, approvedBy: string): Promise<WebhookRun | null> {
  const result = await pool.query<WebhookRun>(
    `UPDATE remote_agent_automation_runs
     SET status = 'accepted',
         approved_by = $2,
         approved_at = NOW(),
         reason = COALESCE(reason, 'approved_by_maintainer')
     WHERE id = $1
       AND status = 'requires_approval'
     RETURNING *`,
    [runId, approvedBy]
  );
  const approvedRun = result.rows[0] ?? null;
  if (approvedRun) {
    await safeEmitRunEvent(pool, {
      runId: approvedRun.id,
      chainId: approvedRun.chain_id,
      eventType: 'run_approved',
      status: approvedRun.status,
      message: 'Run approved by maintainer',
      metadata: {
        approvedBy,
        policyDecision: approvedRun.policy_decision,
        riskTier: approvedRun.risk_tier,
      },
    });
  }
  return approvedRun;
}

interface Queryable {
  query: typeof pool.query;
}

interface EmitRunEventInput {
  runId: string;
  chainId: string;
  eventType: string;
  status?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

async function emitRunEvent(client: Queryable, input: EmitRunEventInput): Promise<void> {
  await client.query(
    `INSERT INTO remote_agent_automation_run_events
      (run_id, chain_id, event_type, status, message, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.runId,
      input.chainId,
      input.eventType,
      input.status ?? null,
      input.message ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

async function safeEmitRunEvent(client: Queryable, input: EmitRunEventInput): Promise<void> {
  try {
    await emitRunEvent(client, input);
  } catch (error) {
    console.warn('[WebhookControlPlane] Failed to emit run event', {
      runId: input.runId,
      eventType: input.eventType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

interface InsertRunInput {
  chainId: string;
  deliveryId: string;
  dedupeKey: string;
  eventType: string;
  action: string;
  headSha: string | null;
  status: WebhookRunStatus;
  reason: string | null | undefined;
  isMutating: boolean;
  riskTier: WebhookRiskTier;
  policyDecision: WebhookPolicyDecision;
  policyReason: WebhookPolicyReason;
}

async function findExistingDedupeRun(
  client: { query: typeof pool.query },
  dedupeKey: string
): Promise<WebhookRun | null> {
  const existing = await client.query<WebhookRun>(
    `SELECT *
     FROM remote_agent_automation_runs
     WHERE dedupe_key = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [dedupeKey]
  );
  return existing.rows[0] ?? null;
}

async function insertRun(client: Queryable, input: InsertRunInput): Promise<WebhookRun | null> {
  const result = await client.query<WebhookRun>(
    `INSERT INTO remote_agent_automation_runs
      (chain_id, delivery_id, dedupe_key, event_type, action, head_sha, status, reason, is_mutating, risk_tier, policy_decision, policy_reason, started_at, expires_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [
      input.chainId,
      input.deliveryId,
      input.dedupeKey,
      input.eventType,
      input.action,
      input.headSha,
      input.status,
      input.reason ?? null,
      input.isMutating,
      input.riskTier,
      input.policyDecision,
      input.policyReason,
    ]
  );

  const createdRun = result.rows[0] ?? null;
  if (createdRun) {
    await safeEmitRunEvent(client, {
      runId: createdRun.id,
      chainId: createdRun.chain_id,
      eventType: 'run_created',
      status: createdRun.status,
      message: 'Run created',
      metadata: {
        policyDecision: createdRun.policy_decision,
        policyReason: createdRun.policy_reason,
        riskTier: createdRun.risk_tier,
        isMutating: createdRun.is_mutating,
      },
    });
  }
  return createdRun;
}

async function upsertChain(
  client: { query: typeof pool.query },
  input: IntakeWebhookRunInput
): Promise<WebhookChain> {
  const result = await client.query<WebhookChain>(
    `INSERT INTO remote_agent_automation_chains
      (platform_type, conversation_id, repository_full_name, object_type, object_number)
     VALUES
      ($1, $2, $3, $4, $5)
     ON CONFLICT (platform_type, conversation_id)
     DO UPDATE SET repository_full_name = EXCLUDED.repository_full_name,
                   object_type = EXCLUDED.object_type,
                   object_number = EXCLUDED.object_number,
                   updated_at = NOW()
     RETURNING *`,
    [
      input.platformType,
      input.conversationId,
      input.repositoryFullName,
      input.objectType,
      input.objectNumber,
    ]
  );
  return result.rows[0];
}

async function maybeResetIterationWindow(
  client: { query: typeof pool.query },
  chain: WebhookChain
): Promise<WebhookChain> {
  const windowMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const startedMs = new Date(chain.iteration_window_started_at).getTime();
  if (nowMs - startedMs < windowMs) {
    return chain;
  }

  const result = await client.query<WebhookChain>(
    `UPDATE remote_agent_automation_chains
     SET iteration_count = 0,
         iteration_window_started_at = NOW(),
         status = CASE WHEN status = 'paused' THEN 'active' ELSE status END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [chain.id]
  );

  return result.rows[0];
}
