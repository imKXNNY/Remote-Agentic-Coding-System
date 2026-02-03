<script lang="ts">
  import { onMount } from 'svelte';
  import { API } from './lib/api';
  import Login from './components/Login.svelte';
  import FileTree from './components/FileTree.svelte';
  import Chat from './components/Chat.svelte';
  import Preview from './components/Preview.svelte';

  let authenticated = API.isLoggedIn();
  let loading = true;

  let currentFile = '';
  let currentContent = '';
  let previewLoading = false;
  let showExplorer = true;
  let showPreview = true;
  let isNarrowScreen = false;
  let mobilePanel: 'chat' | 'explorer' | 'preview' = 'chat';
  let layoutInitialized = false;

  const LAYOUT_STORAGE_KEY = 'webui.layout.v1';
  const NARROW_LAYOUT_QUERY = '(max-width: 1100px)';

  function logLayoutStorageError(context: string, error: unknown): void {
    console.warn(`[WebUI] ${context}`, error);
  }

  function loadLayoutState(): void {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        showExplorer?: boolean;
        showPreview?: boolean;
        mobilePanel?: 'chat' | 'explorer' | 'preview';
      };
      if (typeof parsed.showExplorer === 'boolean') {
        showExplorer = parsed.showExplorer;
      }
      if (typeof parsed.showPreview === 'boolean') {
        showPreview = parsed.showPreview;
      }
      if (parsed.mobilePanel === 'chat' || parsed.mobilePanel === 'explorer' || parsed.mobilePanel === 'preview') {
        mobilePanel = parsed.mobilePanel;
      }
    } catch (error) {
      logLayoutStorageError('Failed to restore layout state', error);
    }
  }

  function saveLayoutState(): void {
    if (!layoutInitialized) return;
    try {
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          showExplorer,
          showPreview,
          mobilePanel,
        })
      );
    } catch (error) {
      logLayoutStorageError('Failed to persist layout state', error);
    }
  }

  function syncViewport(mql: MediaQueryList | MediaQueryListEvent): void {
    isNarrowScreen = mql.matches;
    if (mobilePanel === 'explorer' && !showExplorer) {
      mobilePanel = 'chat';
    }
    if (mobilePanel === 'preview' && !showPreview) {
      mobilePanel = 'chat';
    }
  }

  function toggleExplorer(): void {
    showExplorer = !showExplorer;
    if (!showExplorer && mobilePanel === 'explorer') {
      mobilePanel = 'chat';
    }
  }

  function togglePreview(): void {
    showPreview = !showPreview;
    if (!showPreview && mobilePanel === 'preview') {
      mobilePanel = 'chat';
    }
  }

  function getDesktopColumns(): string {
    const columns: string[] = [];
    if (showExplorer) {
      columns.push('minmax(240px, 320px)');
    }
    columns.push('minmax(420px, 1fr)');
    if (showPreview) {
      columns.push('minmax(320px, 1fr)');
    }
    return columns.join(' ');
  }

  $: desktopColumns = getDesktopColumns();
  $: saveLayoutState();

  onMount(() => {
    loadLayoutState();
    const mql = window.matchMedia(NARROW_LAYOUT_QUERY);
    syncViewport(mql);
    const onViewportChange = (event: MediaQueryListEvent) => syncViewport(event);
    mql.addEventListener('change', onViewportChange);

    void (async () => {
      if (authenticated) {
        try {
          await API.getConversations();
        } catch {
          authenticated = false;
        }
      }

      layoutInitialized = true;
      loading = false;
    })();

    return () => {
      mql.removeEventListener('change', onViewportChange);
    };
  });

  async function handleFileSelect(event: CustomEvent): Promise<void> {
    const file = event.detail;
    currentFile = file.path;
    previewLoading = true;
    try {
      const res = await API.getFileContent(file.path);
      currentContent = res.content;
    } catch (e) {
      console.error(e);
      currentContent = '// Error loading file content';
    } finally {
      previewLoading = false;
    }
  }
</script>

<main>
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Initializing Remote Agent...</span>
    </div>
  {:else if !authenticated}
    <Login />
  {:else}
    <div class="workspace-shell">
      <div class="workspace-toolbar">
        <div class="toolbar-group">
          <button class="toggle-btn" class:active={showExplorer} aria-pressed={showExplorer} on:click={toggleExplorer}>
            Explorer
          </button>
          <button class="toggle-btn" class:active={showPreview} aria-pressed={showPreview} on:click={togglePreview}>
            Preview
          </button>
        </div>

        {#if isNarrowScreen}
          <div class="toolbar-group mobile-tabs" role="group" aria-label="Active panel">
            {#if showExplorer}
              <button
                class="tab-btn"
                class:active={mobilePanel === 'explorer'}
                aria-pressed={mobilePanel === 'explorer'}
                aria-label="Show files panel"
                on:click={() => (mobilePanel = 'explorer')}
              >
                Files
              </button>
            {/if}
            <button
              class="tab-btn"
              class:active={mobilePanel === 'chat'}
              aria-pressed={mobilePanel === 'chat'}
              aria-label="Show chat panel"
              on:click={() => (mobilePanel = 'chat')}
            >
              Chat
            </button>
            {#if showPreview}
              <button
                class="tab-btn"
                class:active={mobilePanel === 'preview'}
                aria-pressed={mobilePanel === 'preview'}
                aria-label="Show preview panel"
                on:click={() => (mobilePanel = 'preview')}
              >
                Preview
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <div class="layout" style:--desktop-cols={desktopColumns}>
        {#if !isNarrowScreen}
          {#if showExplorer}
            <aside class="pane explorer-pane">
              <div class="section-header">
                <h3>Explorer</h3>
              </div>
              <div class="section-content">
                <FileTree on:select={handleFileSelect} />
              </div>
            </aside>
          {/if}

          <section class="pane chat-pane">
            <div class="section-header">
              <h3>Remote Agent Chat</h3>
            </div>
            <div class="section-content">
              <Chat />
            </div>
          </section>

          {#if showPreview}
            <section class="pane preview-pane">
              {#if previewLoading}
                <div class="loading-preview glass">
                  <div class="spinner"></div>
                  <span>Loading {currentFile.split('/').pop()}...</span>
                </div>
              {:else if currentFile}
                <Preview path={currentFile} content={currentContent} />
              {:else}
                <div class="placeholder">
                  <div class="icon">Preview</div>
                  <p>Select a file from the explorer to preview content</p>
                </div>
              {/if}
            </section>
          {/if}
        {:else}
          {#if mobilePanel === 'explorer' && showExplorer}
            <aside class="pane explorer-pane mobile-pane">
              <div class="section-header">
                <h3>Explorer</h3>
              </div>
              <div class="section-content">
                <FileTree on:select={handleFileSelect} />
              </div>
            </aside>
          {:else if mobilePanel === 'preview' && showPreview}
            <section class="pane preview-pane mobile-pane">
              {#if previewLoading}
                <div class="loading-preview glass">
                  <div class="spinner"></div>
                  <span>Loading {currentFile.split('/').pop()}...</span>
                </div>
              {:else if currentFile}
                <Preview path={currentFile} content={currentContent} />
              {:else}
                <div class="placeholder">
                  <div class="icon">Preview</div>
                  <p>Select a file from the explorer to preview content</p>
                </div>
              {/if}
            </section>
          {:else}
            <section class="pane chat-pane mobile-pane">
              <div class="section-header">
                <h3>Remote Agent Chat</h3>
              </div>
              <div class="section-content">
                <Chat />
              </div>
            </section>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    height: 100dvh;
    width: 100vw;
    display: flex;
    overflow: hidden;
    background-color: var(--bg-primary);
  }

  .loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--gap-md);
    color: var(--text-secondary);
  }

  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .workspace-shell {
    width: 100vw;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .workspace-toolbar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-subtle);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toggle-btn,
  .tab-btn {
    border: 1px solid var(--border-subtle);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .toggle-btn:hover,
  .tab-btn:hover {
    color: var(--text-primary);
    border-color: var(--accent-blue);
  }

  .toggle-btn.active,
  .tab-btn.active {
    color: white;
    background: var(--accent-blue);
    border-color: var(--accent-blue);
  }

  .layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--desktop-cols);
    gap: 0;
  }

  .pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-secondary);
  }

  .explorer-pane,
  .chat-pane {
    border-right: 1px solid var(--border-subtle);
  }

  .preview-pane {
    background: var(--bg-primary);
    position: relative;
  }

  .section-header {
    height: var(--header-height);
    padding: 0 var(--gap-md);
    display: flex;
    align-items: center;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-subtle);
  }

  .section-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .loading-preview {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--gap-md);
  }

  .placeholder {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: var(--text-muted);
    gap: var(--gap-md);
    background: radial-gradient(circle at center, rgba(14, 99, 156, 0.05) 0%, transparent 70%);
  }

  .placeholder .icon {
    font-size: 1rem;
    opacity: 0.5;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
  }

  h3 {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1rem;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  @media (max-width: 1100px) {
    .workspace-toolbar {
      flex-wrap: wrap;
      height: auto;
      padding: 8px 10px;
      align-items: flex-start;
    }

    .mobile-tabs {
      width: 100%;
    }

    .layout {
      display: block;
    }

    .mobile-pane {
      height: 100%;
    }

    .explorer-pane,
    .chat-pane {
      border-right: none;
    }
  }
</style>
