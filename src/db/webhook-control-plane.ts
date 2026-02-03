import { pool } from './connection';
import {
  WebhookRunStatus,
  buildFailureSignature,
  evaluateWebhookGuardrails,
  isTerminalWebhookRunStatus,
} from '../utils/webhook-control-plane';

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
  started_at: Date | null;
  finished_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

interface IntakeWebhookRunInput {
  platformType: 'github';
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
}

interface IntakeDecision {
  decision: 'accepted' | 'deduped' | 'replay_inflight' | 'paused';
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
    const chainAfterWindowReset = await maybeResetIterationWindow(client, chain);

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

      await client.query(
        `UPDATE remote_agent_automation_chains
         SET status = 'paused',
             updated_at = NOW()
         WHERE id = $1`,
        [chainAfterWindowReset.id]
      );

      await client.query('COMMIT');
      return { decision: 'paused', run: pausedRun, chain: { ...chainAfterWindowReset, status: 'paused' } };
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
}

export async function registerWebhookFailure(
  chainId: string,
  runId: string,
  errorMessage: string
): Promise<{ shouldPause: boolean; failureSignature: string }> {
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
             ) >= 2
               THEN 'paused'
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING repeated_failure_count`,
      [chainId, signature]
    );

    await client.query(
      `UPDATE remote_agent_automation_runs
       SET failure_signature = $2
       WHERE id = $1`,
      [runId, signature]
    );

    await client.query('COMMIT');

    const repeatCount = chainUpdate.rows[0]?.repeated_failure_count;
    if (!repeatCount) {
      return { shouldPause: false, failureSignature: signature };
    }
    return { shouldPause: repeatCount >= 2, failureSignature: signature };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRecentWebhookRuns(limit = 50): Promise<WebhookRun[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const result = await pool.query<WebhookRun>(
    `SELECT *
     FROM remote_agent_automation_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
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

async function insertRun(client: { query: typeof pool.query }, input: InsertRunInput): Promise<WebhookRun | null> {
  const result = await client.query<WebhookRun>(
    `INSERT INTO remote_agent_automation_runs
      (chain_id, delivery_id, dedupe_key, event_type, action, head_sha, status, reason, is_mutating, started_at, expires_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '24 hours')
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
    ]
  );

  return result.rows[0] ?? null;
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
