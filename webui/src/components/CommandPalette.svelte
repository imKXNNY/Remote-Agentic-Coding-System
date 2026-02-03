<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { API } from '../lib/api';

  export let conversationId: string;

  let commands: Record<string, { path: string; description: string }> = {};
  let loading = false;
  let error = '';
  let selectedCommand = '';
  let argsDraft = '';
  let filterText = '';

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
    selectedCommand = name;
    dispatch('select', `/command-invoke ${name}`);
  }

  function runSelectedWithArgs(): void {
    if (!selectedCommand) return;
    const args = argsDraft.trim();
    const command = args
      ? `/command-invoke ${selectedCommand} ${args}`
      : `/command-invoke ${selectedCommand}`;
    dispatch('select', command);
  }

  function getGroupName(commandName: string): 'Core Workflow' | 'Maintenance' | 'Other' {
    if (['prime', 'plan-feature', 'execute', 'validate', 'commit'].includes(commandName)) {
      return 'Core Workflow';
    }
    if (
      ['status', 'bootstrap', 'reset', 'commands', 'load-commands', 'setmodel', 'setsandbox'].includes(
        commandName
      )
    ) {
      return 'Maintenance';
    }
    return 'Other';
  }

  $: filteredEntries = Object.entries(commands)
    .filter(([name, def]) => {
      const q = filterText.trim().toLowerCase();
      if (!q) return true;
      return name.toLowerCase().includes(q) || def.description.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  $: groupedEntries = filteredEntries.reduce(
    (acc, entry) => {
      const group = getGroupName(entry[0]);
      acc[group].push(entry);
      return acc;
    },
    {
      'Core Workflow': [] as [string, { path: string; description: string }][],
      Maintenance: [] as [string, { path: string; description: string }][],
      Other: [] as [string, { path: string; description: string }][],
    }
  );
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

  <input
    class="command-filter"
    type="text"
    bind:value={filterText}
    placeholder="Filter workflows..."
  />

  <div class="arg-runner">
    <select bind:value={selectedCommand} class="arg-select">
      <option value="">Select workflow for args...</option>
      {#each Object.keys(commands).sort() as commandName}
        <option value={commandName}>{commandName}</option>
      {/each}
    </select>
    <input
      class="arg-input"
      type="text"
      bind:value={argsDraft}
      placeholder="optional args"
      on:keydown={e => e.key === 'Enter' && runSelectedWithArgs()}
    />
    <button class="run-btn" on:click={runSelectedWithArgs} disabled={!selectedCommand}>Run</button>
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
      {#each Object.entries(groupedEntries) as [groupName, entries]}
        {#if entries.length > 0}
          <div class="group-title">{groupName}</div>
          {#each entries as [name, def]}
            <button class="command-item" on:click={() => handleSelect(name)}>
              <div class="command-name">/{name}</div>
              <div class="command-desc">{def.description}</div>
            </button>
          {/each}
        {/if}
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

  .command-filter,
  .arg-select,
  .arg-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    padding: 6px 8px;
    font-size: 0.78rem;
    outline: none;
  }

  .command-filter:focus,
  .arg-select:focus,
  .arg-input:focus {
    border-color: var(--accent-blue);
  }

  .arg-runner {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .run-btn {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    font-size: 0.78rem;
    padding: 6px 8px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .run-btn:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--accent-blue);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .group-title {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 6px;
    padding: 2px 2px;
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
