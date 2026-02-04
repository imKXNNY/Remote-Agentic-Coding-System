<script lang="ts">
  import { onMount } from 'svelte';
  import { API } from '../lib/api';

  interface RunRow {
    id: string;
    chain_id: string;
    status: string;
    reason: string | null;
    created_at: string;
    event_type: string;
    platform_type?: string;
    repository_full_name?: string;
  }

  interface RunEvent {
    id: string;
    event_type: string;
    status: string | null;
    message: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }

  interface MetricsPayload {
    statusCounts: Record<string, number>;
    totals: {
      totalRuns: number;
      dedupedRuns: number;
      pausedRuns: number;
      approvalRequiredRuns: number;
      blockedRuns: number;
      executedRuns: number;
    };
  }

  let runs: RunRow[] = [];
  let events: RunEvent[] = [];
  let metrics: MetricsPayload | null = null;
  let loading = false;
  let loadingEvents = false;
  let error = '';
  let selectedRunId = '';

  let platform = '';
  let status = '';
  let windowHours = 24;
  let search = '';

  async function loadRuns(): Promise<void> {
    loading = true;
    error = '';
    try {
      runs = await API.getWebhookRuns({
        platform: platform || undefined,
        status: status || undefined,
        windowHours,
        search: search || undefined,
        limit: 120,
      });
      if (selectedRunId && !runs.some(run => run.id === selectedRunId)) {
        selectedRunId = '';
        events = [];
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load automation runs';
    } finally {
      loading = false;
    }
  }

  async function loadMetrics(): Promise<void> {
    try {
      metrics = await API.getWebhookMetrics();
    } catch {
      metrics = null;
    }
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId = runId;
    loadingEvents = true;
    try {
      events = await API.getWebhookRunEvents(runId, 200);
    } catch {
      events = [];
    } finally {
      loadingEvents = false;
    }
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' });
  }

  onMount(async () => {
    await Promise.all([loadRuns(), loadMetrics()]);
  });
</script>

<section class="automation-panel glass">
  <div class="panel-header">
    <h3>Automation Runs</h3>
    <button class="refresh-btn" on:click={() => Promise.all([loadRuns(), loadMetrics()])} disabled={loading}>
      Refresh
    </button>
  </div>

  <div class="filters">
    <select bind:value={platform}>
      <option value="">All platforms</option>
      <option value="github">GitHub</option>
      <option value="openclaw">OpenClaw</option>
    </select>
    <select bind:value={status}>
      <option value="">All statuses</option>
      <option value="accepted">accepted</option>
      <option value="executed">executed</option>
      <option value="paused">paused</option>
      <option value="blocked_policy">blocked_policy</option>
      <option value="requires_approval">requires_approval</option>
      <option value="deduped">deduped</option>
    </select>
    <select bind:value={windowHours}>
      <option value={1}>1h</option>
      <option value={6}>6h</option>
      <option value={24}>24h</option>
      <option value={72}>72h</option>
      <option value={168}>7d</option>
    </select>
    <input bind:value={search} placeholder="run/chain/repo..." />
    <button class="apply-btn" on:click={loadRuns} disabled={loading}>Apply</button>
  </div>

  {#if metrics}
    <div class="summary">
      <span>Total: {metrics.totals.totalRuns}</span>
      <span>Executed: {metrics.totals.executedRuns}</span>
      <span>Paused: {metrics.totals.pausedRuns}</span>
      <span>Blocked: {metrics.totals.blockedRuns}</span>
      <span>Approval: {metrics.totals.approvalRequiredRuns}</span>
    </div>
  {/if}

  {#if error}
    <div class="status error">{error}</div>
  {:else if loading}
    <div class="status">Loading automation data...</div>
  {:else if runs.length === 0}
    <div class="status">No runs found for current filters.</div>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Status</th>
            <th>Platform</th>
            <th>Reason</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each runs as run}
            <tr class:selected={run.id === selectedRunId} on:click={() => selectRun(run.id)}>
              <td title={run.id}>{run.id.slice(0, 8)}...</td>
              <td>{run.status}</td>
              <td>{run.platform_type || 'n/a'}</td>
              <td title={run.reason || ''}>{run.reason || '-'}</td>
              <td>{formatDate(run.created_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="events">
    <div class="events-header">Run timeline {selectedRunId ? `(${selectedRunId.slice(0, 8)}...)` : ''}</div>
    {#if !selectedRunId}
      <div class="status">Select a run to inspect event timeline.</div>
    {:else if loadingEvents}
      <div class="status">Loading events...</div>
    {:else if events.length === 0}
      <div class="status">No events available.</div>
    {:else}
      <div class="event-list">
        {#each events as event}
          <div class="event-item">
            <div class="event-top">
              <strong>{event.event_type}</strong>
              <span>{event.status || '-'}</span>
              <span>{formatDate(event.created_at)}</span>
            </div>
            {#if event.message}
              <div class="event-message">{event.message}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .automation-panel { padding: var(--gap-md); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 8px; }
  .panel-header { display: flex; justify-content: space-between; align-items: center; }
  .panel-header h3 { margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .refresh-btn,.apply-btn { background: transparent; border: 1px solid var(--border-subtle); color: var(--text-secondary); border-radius: var(--radius-sm); padding: 4px 8px; cursor: pointer; font-size: 0.75rem; }
  .filters { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 6px; }
  .filters select,.filters input { background: rgba(0,0,0,0.25); border: 1px solid var(--border-subtle); color: var(--text-secondary); border-radius: var(--radius-sm); padding: 5px 6px; font-size: 0.75rem; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.72rem; color: var(--text-muted); }
  .status { font-size: 0.78rem; color: var(--text-muted); }
  .status.error { color: var(--error-red); }
  .table-wrap { overflow: auto; max-height: 220px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  th,td { text-align: left; padding: 6px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); }
  tr { cursor: pointer; }
  tr:hover, tr.selected { background: rgba(255,255,255,0.04); }
  .events { border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 8px; min-height: 120px; }
  .events-header { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; }
  .event-list { display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow: auto; }
  .event-item { border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px; background: rgba(255,255,255,0.02); }
  .event-top { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; color: var(--text-secondary); font-size: 0.72rem; }
  .event-message { margin-top: 4px; font-size: 0.72rem; color: var(--text-muted); word-break: break-word; }
  @media (max-width: 1200px) {
    .filters { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
</style>
