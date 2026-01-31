<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import * as monaco from 'monaco-editor';

  export let content = '';
  export let path = '';

  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor;
  let currentPath = '';

  onMount(() => {
    editor = monaco.editor.create(container, {
      value: content,
      language: getLanguage(path),
      theme: 'vs-dark',
      automaticLayout: true,
      readOnly: true,
      minimap: { enabled: false },
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.dispose();
    }
  });

  $: if (editor && path !== currentPath) {
    // New file selected
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, getLanguage(path));
      model.setValue(content);
    }
    currentPath = path;
  } else if (editor && content !== editor.getValue()) {
    // Content updated externally (e.g. reload)
    editor.setValue(content);
  }

  function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
        return 'typescript';
      case 'js':
        return 'javascript';
      case 'json':
        return 'json';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'svelte':
        return 'html'; // Monaco logic often uses html for svelte without plugin
      default:
        return 'plaintext';
    }
  }
</script>

<div class="preview-container">
  <div class="preview-header">
    <div class="file-info">
      <span class="icon">📄</span>
      <span class="path">{path}</span>
    </div>
  </div>
  <div class="editor-wrapper" bind:this={container}></div>
</div>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
  }

  .preview-header {
    height: var(--header-height);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    padding: 0 var(--gap-md);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .file-info .icon {
    font-size: 1rem;
    opacity: 0.7;
  }

  .editor-wrapper {
    flex: 1;
    width: 100%;
    overflow: hidden;
  }
</style>
