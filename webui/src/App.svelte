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

  onMount(async () => {
    if (authenticated) {
      try {
        await API.getConversations(); // Validate token
      } catch (e) {
        authenticated = false;
      }
    }
    loading = false;
  });

  async function handleFileSelect(event: CustomEvent) {
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
    <div class="layout">
      <div class="sidebar">
        <div class="sidebar-section files">
          <div class="section-header">
            <h3>Explorer</h3>
          </div>
          <div class="section-content">
            <FileTree on:select={handleFileSelect} />
          </div>
        </div>
        <div class="sidebar-section chat">
          <div class="section-header">
            <h3>Remote Agent Chat</h3>
          </div>
          <div class="section-content">
            <Chat />
          </div>
        </div>
      </div>
      <div class="preview-area">
        {#if previewLoading}
          <div class="loading-preview glass">
            <div class="spinner"></div>
            <span>Loading {currentFile.split('/').pop()}...</span>
          </div>
        {:else if currentFile}
          <Preview path={currentFile} content={currentContent} />
        {:else}
          <div class="placeholder">
            <div class="icon">🛰️</div>
            <p>Select a file from the explorer to preview content</p>
          </div>
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

  .layout {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    width: 100vw;
    height: 100dvh;
  }

  .sidebar {
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-section.files {
    height: 40%;
    border-bottom: 1px solid var(--border-subtle);
  }

  .sidebar-section.chat {
    flex: 1;
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
    overflow: auto;
  }

  .preview-area {
    background: var(--bg-primary);
    position: relative;
    overflow: hidden;
    height: 100%;
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
    font-size: 4rem;
    opacity: 0.1;
  }

  h3 {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1rem;
    text-transform: uppercase;
    color: var(--text-muted);
  }
</style>
