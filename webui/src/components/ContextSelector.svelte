<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { API } from '../lib/api';

  export let selectedCodebaseId: string | null = null;
  export let conversationId = '';
  export let additionalDirs: string[] = [];
  export let cwd: string | null = null;
  export let assistantType: string | null = null;
  export let modelId: string | null = null;
  export let sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' | null = null;

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
  let modelDraft = '';
  let sandboxDraft: 'read-only' | 'workspace-write' | 'danger-full-access' = 'workspace-write';
  let addDirDraft = '';
  let lastModelFromServer: string | null = null;
  let lastSandboxFromServer: 'read-only' | 'workspace-write' | 'danger-full-access' | null = null;
  const commonModels = ['gpt-5', 'gpt-5-codex', 'gpt-5-mini'];
  let linkedIssue:
    | {
        owner: string;
        repo: string;
        number: number;
        title?: string;
      }
    | null = null;

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
  $: if (conversationId) {
    loadLinkedIssue();
  }
  $: if (modelId !== lastModelFromServer) {
    modelDraft = modelId ?? '';
    lastModelFromServer = modelId ?? null;
  }
  $: if (sandboxMode !== lastSandboxFromServer) {
    sandboxDraft = sandboxMode ?? 'workspace-write';
    lastSandboxFromServer = sandboxMode ?? null;
  }

  function handleSelect(id: string) {
    if (id !== selectedCodebaseId) {
      dispatch('select', `/set-codebase ${id}`);
    }
  }

  function applyModel(): void {
    const value = modelDraft.trim();
    if (!value) return;
    dispatch('select', `/setmodel ${value}`);
  }

  function applySandbox(): void {
    dispatch('select', `/setsandbox ${sandboxDraft}`);
  }

  function addDirectory(): void {
    const value = addDirDraft.trim();
    if (!value) return;
    dispatch('select', `/codex-add-dir "${value}"`);
    addDirDraft = '';
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
    const repoInfo = activeCodebase?.repository_url ? getOwnerRepo(activeCodebase.repository_url) : null;
    if (!repoInfo) return;
    const escapedTitle = String(issue.title ?? '').replace(/"/g, '\\"');
    dispatch(
      'select',
      `/context link-issue ${repoInfo.owner}/${repoInfo.repo}#${String(issue.number)} "${escapedTitle}"`
    );
    linkedIssue = {
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      number: issue.number,
      title: issue.title,
    };

    showIssuePicker = false;
    selectedIssueId = '';
  }

  async function loadLinkedIssue(): Promise<void> {
    if (!conversationId) return;
    try {
      const data = await API.getConversationContext(conversationId);
      linkedIssue = data.linkedIssue ?? null;
    } catch {
      linkedIssue = null;
    }
  }

  function clearLinkedIssue(): void {
    dispatch('select', '/context clear');
    linkedIssue = null;
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

  <div class="quick-actions">
    <button class="action-btn" on:click={() => dispatch('select', '/reset')} title="Reset active session">
      Reset Session
    </button>
    <button
      class="action-btn"
      on:click={() => dispatch('select', '/bootstrap')}
      title="Run project provisioning"
      disabled={!selectedCodebaseId}
    >
      Bootstrap
    </button>
  </div>

  <div class="context-meta">
    <div class="meta-row"><span class="meta-key">CWD</span><span class="meta-value">{cwd || 'n/a'}</span></div>
    <div class="meta-row"><span class="meta-key">Assistant</span><span class="meta-value">{assistantType || 'n/a'}</span></div>
    <div class="meta-row"><span class="meta-key">Model</span><span class="meta-value">{modelId || 'default'}</span></div>
    <div class="meta-row"><span class="meta-key">Sandbox</span><span class="meta-value">{sandboxMode || 'n/a'}</span></div>
  </div>

  {#if linkedIssue}
    <div class="linked-issue">
      <div class="section-header">
        <span>Linked Issue</span>
        <button class="clear-btn" on:click={clearLinkedIssue}>Clear</button>
      </div>
      <div class="issue-ref">
        {linkedIssue.owner}/{linkedIssue.repo}#{linkedIssue.number}
      </div>
      {#if linkedIssue.title}
        <div class="issue-title-line">{linkedIssue.title}</div>
      {/if}
    </div>
  {/if}

  <div class="config-panel">
    <div class="section-header">
      <span>Runtime Config</span>
    </div>

    <div class="control-row">
      <label for="model-select">Model</label>
      <div class="control-inline">
        <select id="model-select" bind:value={modelDraft} class="inline-control">
          <option value="">Custom...</option>
          {#each commonModels as model}
            <option value={model}>{model}</option>
          {/each}
        </select>
        <input
          class="inline-control"
          type="text"
          bind:value={modelDraft}
          placeholder="model id"
          on:keydown={e => e.key === 'Enter' && applyModel()}
        />
        <button class="mini-btn" on:click={applyModel} disabled={!modelDraft.trim()}>Set</button>
      </div>
    </div>

    <div class="control-row">
      <label for="sandbox-select">Sandbox</label>
      <div class="control-inline">
        <select id="sandbox-select" bind:value={sandboxDraft} class="inline-control">
          <option value="read-only">read-only</option>
          <option value="workspace-write">workspace-write</option>
          <option value="danger-full-access">danger-full-access</option>
        </select>
        <button class="mini-btn" on:click={applySandbox} disabled={!selectedCodebaseId}>Apply</button>
      </div>
    </div>
  </div>

  <div class="config-panel">
    <div class="section-header">
      <span>Additional Directory</span>
    </div>
    <div class="control-inline">
      <input
        class="inline-control"
        type="text"
        bind:value={addDirDraft}
        placeholder="relative path from /workspace"
        on:keydown={e => e.key === 'Enter' && addDirectory()}
      />
      <button class="mini-btn" on:click={addDirectory} disabled={!addDirDraft.trim()}>Add</button>
    </div>
  </div>

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

  .quick-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .action-btn {
    font-size: 0.78rem;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--accent-blue);
    background: rgba(14, 99, 156, 0.12);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .context-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
  }

  .meta-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.75rem;
  }

  .meta-key {
    min-width: 58px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meta-value {
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
  }

  .linked-issue {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-radius: var(--radius-sm);
    background: rgba(43, 85, 29, 0.12);
    border: 1px solid rgba(43, 85, 29, 0.35);
  }

  .issue-ref {
    color: var(--text-primary);
    font-size: 0.8rem;
    font-family: var(--font-mono);
  }

  .issue-title-line {
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .control-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-row label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .control-inline {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .inline-control {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    padding: 6px 8px;
    font-size: 0.8rem;
  }

  .inline-control:focus {
    outline: none;
    border-color: var(--accent-blue);
  }

  .mini-btn {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .mini-btn:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--accent-blue);
    background: rgba(14, 99, 156, 0.12);
  }

  .mini-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
