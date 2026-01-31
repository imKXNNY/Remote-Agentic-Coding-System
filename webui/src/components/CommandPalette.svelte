<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { API } from '../lib/api';

  export let conversationId: string;

  let commands: Record<string, { path: string; description: string }> = {};
  let loading = false;
  let error = '';

  const dispatch = createEventDispatcher<{
    select: string;
  }>();

  async function loadCommands() {
    if (!conversationId) return;
    loading = true;
    error = '';
    try {
      commands = await API.getCommands(conversationId);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (conversationId) {
    loadCommands();
  }

  function handleSelect(name: string) {
    dispatch('select', `/command-invoke ${name}`);
  }
</script>

<div class="command-palette glass">
  <div class="palette-header">
    <h3>Workflows</h3>
    <button class="refresh-btn" on:click={loadCommands} title="Refresh commands">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path
          fill="currentColor"
          d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
        />
      </svg>
    </button>
  </div>

  {#if loading}
    <div class="palette-status">Loading commands...</div>
  {:else if error}
    <div class="palette-status error">{error}</div>
  {:else if Object.keys(commands).length === 0}
    <div class="palette-status empty">
      No workflows found. Run /load-commands in chat to register some.
    </div>
  {:else}
    <div class="commands-list">
      {#each Object.entries(commands) as [name, def]}
        <button class="command-item" on:click={() => handleSelect(name)}>
          <div class="command-name">/{name}</div>
          <div class="command-desc">{def.description}</div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .command-palette {
    padding: var(--gap-md);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--gap-md);
    max-height: 400px;
  }

  .palette-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .palette-header h3 {
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

  .palette-status {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
    padding: var(--gap-md);
  }

  .palette-status.error {
    color: var(--error-red);
  }

  .commands-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .command-item {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .command-item:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--border-subtle);
  }

  .command-name {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--accent-blue);
    font-weight: 600;
  }

  .command-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
