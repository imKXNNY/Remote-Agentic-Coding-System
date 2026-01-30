<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { API } from '../lib/api';

  export let path = '';
  export let level = 0;

  const dispatch = createEventDispatcher();

  let files: Array<{ name: string; type: 'file' | 'directory'; path: string }> = [];
  let expanded = false;
  let loading = false;
  let loaded = false;

  async function toggle() {
    if (!expanded) {
      if (!loaded) {
        loading = true;
        try {
          files = await API.getFiles(path);
          files.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
          });
          loaded = true;
        } catch (e) {
          console.error(e);
        } finally {
          loading = false;
        }
      }
    }
    expanded = !expanded;
  }

  function handleSelect(file: { path: string }) {
    dispatch('select', file);
  }

  // Auto-load root
  if (level === 0) {
    toggle();
  }
</script>

<div class="explorer-node">
  {#if level > 0 && path}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      class="item directory {expanded ? 'expanded' : ''}"
      style="padding-left: {level * 12}px"
      on:click={toggle}
      on:keydown={e => e.key === 'Enter' && toggle()}
      role="button"
      tabindex="0"
    >
      <span class="chevron">{expanded ? '▼' : '▶'}</span>
      <span class="icon">{expanded ? '📂' : '📁'}</span>
      <span class="name">{path.split('/').pop() || path}</span>
    </div>
  {/if}

  {#if expanded || level === 0}
    <div class="children">
      {#if loading}
        <div class="status-item" style="padding-left: {(level + 1) * 12}px">
          <span class="spinner-tiny"></span>
          <span>Loading...</span>
        </div>
      {:else}
        {#each files as file}
          {#if file.type === 'directory'}
            <svelte:self path={file.path} level={level + 1} on:select />
          {:else}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div
              class="item file"
              style="padding-left: {(level + (level > 0 ? 1 : 0)) * 12}px"
              on:click={() => handleSelect(file)}
              on:keydown={e => e.key === 'Enter' && handleSelect(file)}
              role="button"
              tabindex="0"
            >
              <span class="icon">📄</span>
              <span class="name">{file.name}</span>
            </div>
          {/if}
        {:else}
          {#if loaded && files.length === 0}
            <div class="status-item empty" style="padding-left: {(level + 1) * 12}px">
              (Empty folder)
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .explorer-node {
    display: flex;
    flex-direction: column;
  }

  .item {
    cursor: pointer;
    height: 28px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 12px;
    font-size: 0.9rem;
    color: var(--text-secondary);
    transition: background var(--transition-fast);
    user-select: none;
    white-space: nowrap;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
  }

  .item.directory .chevron {
    font-size: 0.6rem;
    width: 10px;
    opacity: 0.5;
  }

  .item .icon {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  .item .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-item {
    height: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-style: italic;
  }

  .spinner-tiny {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
