<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { API } from '../lib/api';

  export let selectedCodebaseId: string | null = null;
  export let additionalDirs: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let codebases: any[] = [];
  let loading = false;
  let error = '';

  // Issue context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let issues: any[] = [];
  let loadingIssues = false;
  let showIssuePicker = false;
  let selectedIssueId = '';

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
    if (id !== selectedCodebaseId) {
      dispatch('select', `/set-codebase ${id}`);
    }
  }

  // --- GitHub Issue Integration ---

  $: activeCodebase = codebases.find(cb => cb.id === selectedCodebaseId);
  $: isGitHubRepo = activeCodebase && activeCodebase.repository_url?.includes('github.com');

  function getOwnerRepo(url: string) {
    if (!url) return null;
    const match = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    return match ? { owner: match[1], repo: match[2] } : null;
  }

  async function loadIssues() {
    if (!isGitHubRepo || !activeCodebase) return;
    const repoInfo = getOwnerRepo(activeCodebase.repository_url);
    if (!repoInfo) return;

    loadingIssues = true;
    try {
      issues = await API.getGitHubIssues(repoInfo.owner, repoInfo.repo);
      showIssuePicker = true;
    } catch (e) {
      console.error('Failed to load issues', e);
    } finally {
      loadingIssues = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleIssueSelect(issue: any) {
    // Construct context message
    const contextMsg = `/context link-issue ${issue.number}`;
    // Simplified for now, or use natural language:
    // "Context: Issue #123 - Title"
    // Let's stick to natural language injection into chat input
    const userMsg = `Context: Issue #${issue.number} - ${issue.title}`;
    dispatch('select', userMsg);

    showIssuePicker = false;
    selectedIssueId = '';
  }
</script>

<div class="context-selector glass">
  <div class="selector-header">
    <h3>Active Context</h3>
    <div class="actions">
      {#if isGitHubRepo && !showIssuePicker}
        <button
          class="refresh-btn link-issue"
          on:click={loadIssues}
          title="Connect to GitHub Issue"
          disabled={loadingIssues}
        >
          {#if loadingIssues}
            <span class="spinner"></span>
          {:else}
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M8 0a8 8 0 100 16A8 8 0 008 0zM4 8a1 1 0 011-1h1.5v-1a1 1 0 112 0v1H10a1 1 0 110 2H8.5v1.5a1 1 0 11-2 0V10H5a1 1 0 01-1-1z"
              />
            </svg>
            Link Issue
          {/if}
        </button>
      {/if}
      <button class="refresh-btn" on:click={loadCodebases} title="Refresh codebases">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
          />
        </svg>
      </button>
    </div>
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

  {#if additionalDirs.length > 0}
    <div class="additional-dirs">
      <div class="section-header">
        <span>Additional Context</span>
        <button class="clear-btn" on:click={() => dispatch('select', '/codex-clear-dirs')}>
          Clear All
        </button>
      </div>
      <div class="dir-chips">
        {#each additionalDirs as dir}
          <div class="dir-chip shadow" title={dir}>
            <span class="dir-icon">📁</span>
            <span class="dir-path">{dir.split(/[/\\]/).pop() || dir}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showIssuePicker}
    <div class="issue-picker">
      <div class="picker-header">
        <span>Select Issue</span>
        <button on:click={() => (showIssuePicker = false)}>Cancel</button>
      </div>
      <div class="issue-list">
        {#each issues as issue}
          <button class="issue-item" on:click={() => handleIssueSelect(issue)}>
            <span class="issue-number">#{issue.number}</span>
            <span class="issue-title">{issue.title}</span>
          </button>
        {/each}
      </div>
    </div>
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

  .actions {
    display: flex;
    gap: 4px;
    align-items: center;
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

  .refresh-btn.link-issue {
    font-size: 0.75rem;
    gap: 4px;
    align-items: center;
    padding: 2px 6px;
    background: rgba(43, 85, 29, 0.2);
    border: 1px solid rgba(43, 85, 29, 0.4);
    color: var(--accent-green);
  }

  .refresh-btn.link-issue:hover {
    background: rgba(43, 85, 29, 0.3);
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

  /* Additional Dirs */
  .additional-dirs {
    margin-top: var(--gap-md);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: var(--gap-md);
    border-top: 1px solid var(--border-subtle);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: var(--accent-orange);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 4px;
    transition: var(--transition-fast);
  }

  .clear-btn:hover {
    background: rgba(255, 165, 0, 0.1);
    text-decoration: underline;
  }

  .dir-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .dir-chip {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-secondary);
    max-width: 100%;
  }

  .dir-icon {
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .dir-path {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Issue Picker */
  .issue-picker {
    margin-top: 4px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    overflow: hidden;
  }

  .picker-header {
    background: rgba(255, 255, 255, 0.05);
    padding: 6px 8px;
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .picker-header button {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .issue-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .issue-item {
    display: flex;
    width: 100%;
    gap: 8px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .issue-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
  }

  .issue-number {
    color: var(--accent-blue);
    font-family: monospace;
  }

  .issue-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .spinner {
    width: 8px;
    height: 8px;
    border: 2px solid var(--text-muted);
    border-top-color: var(--accent-green);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
