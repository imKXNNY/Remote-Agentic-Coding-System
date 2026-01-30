<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { API } from '../lib/api';

  export let selectedCodebaseId: string | null = null;

  let codebases: any[] = [];
  let loading = false;
  let error = '';

  const dispatch = createEventDispatcher<{
    select: string;
  }>();

  async function loadCodebases() {
    loading = true;
    error = '';
    try {
      codebases = await API.getCodebases();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(loadCodebases);

  function handleSelect(id: string) {
    // Only dispatch if it's a new selection
    if (id !== selectedCodebaseId) {
      dispatch('select', `/set-codebase ${id}`);
    }
  }
</script>

<div class="context-selector glass">
  <div class="selector-header">
    <h3>Active Context</h3>
    <button class="refresh-btn" on:click={loadCodebases} title="Refresh codebases">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path
          fill="currentColor"
          d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
        />
      </svg>
    </button>
  </div>

  {#if loading}
    <div class="selector-status">Loading codebases...</div>
  {:else if error}
    <div class="selector-status error">{error}</div>
  {:else}
    <select
      class="codebase-dropdown"
      value={selectedCodebaseId || ''}
      on:change={e => handleSelect(e.currentTarget.value)}
    >
      <option value="">No Context (Default)</option>
      {#each codebases as cb}
        <option value={cb.id}>{cb.name}</option>
      {/each}
    </select>
  {/if}
</div>

<style>
  .context-selector {
    padding: var(--gap-md);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--gap-sm);
  }

  .selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .selector-header h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0;
  }

  .refresh-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    transition: var(--transition-fast);
  }

  .refresh-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
  }

  .selector-status {
    font-size: 0.8rem;
    color: var(--text-muted);
    padding: var(--gap-sm) 0;
  }

  .selector-status.error {
    color: var(--error-red);
  }

  .codebase-dropdown {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    padding: 8px 12px;
    font-size: 0.9rem;
    outline: none;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .codebase-dropdown:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--accent-blue);
  }

  .codebase-dropdown option {
    background: #1a1a1a;
    color: var(--text-primary);
  }
</style>
