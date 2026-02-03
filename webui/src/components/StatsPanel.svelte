<script lang="ts">
  import { onMount } from 'svelte';
  import { API } from '../lib/api';

  interface StatRow {
    assistant_type: string;
    total_requests: string;
    avg_ttft: string | null;
    avg_total_latency: string | null;
    success_rate: string | null;
  }

  let rows: StatRow[] = [];
  let loading = false;
  let error = '';

  async function loadStats(): Promise<void> {
    loading = true;
    error = '';
    try {
      rows = await API.getStats();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load stats';
    } finally {
      loading = false;
    }
  }

  function formatMs(value: string | null): string {
    if (!value) return 'n/a';
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 'n/a';
    return `${Math.round(numberValue)} ms`;
  }

  function formatPercent(value: string | null): string {
    if (!value) return 'n/a';
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 'n/a';
    return `${Math.round(numberValue * 100)}%`;
  }

  onMount(loadStats);
</script>

<div class="stats-panel glass">
  <div class="stats-header">
    <h3>Telemetry</h3>
    <button class="refresh-btn" on:click={loadStats} title="Refresh stats">
      Refresh
    </button>
  </div>

  {#if loading}
    <div class="stats-status">Loading metrics...</div>
  {:else if error}
    <div class="stats-status error">{error}</div>
  {:else if rows.length === 0}
    <div class="stats-status">No telemetry data yet.</div>
  {:else}
    <div class="rows">
      {#each rows as row}
        <div class="row">
          <div class="assistant">{row.assistant_type}</div>
          <div class="metric">Requests: {row.total_requests}</div>
          <div class="metric">TTFT: {formatMs(row.avg_ttft)}</div>
          <div class="metric">Total: {formatMs(row.avg_total_latency)}</div>
          <div class="metric">Success: {formatPercent(row.success_rate)}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .stats-panel {
    padding: var(--gap-md);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stats-header h3 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .refresh-btn {
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px 8px;
    transition: var(--transition-fast);
  }

  .refresh-btn:hover {
    color: var(--text-primary);
    border-color: var(--accent-blue);
  }

  .stats-status {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .stats-status.error {
    color: var(--error-red);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
    padding: 8px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 8px;
  }

  .assistant {
    grid-column: 1 / -1;
    color: var(--text-primary);
    font-size: 0.82rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .metric {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }
</style>
