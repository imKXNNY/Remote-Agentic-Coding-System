<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { API } from '../lib/api';
  import {
    messages,
    status,
    connect,
    sendMessage,
    joinConversation as wsJoin,
  } from '../lib/websocket';
  import CommandPalette from './CommandPalette.svelte';
  import ContextSelector from './ContextSelector.svelte';

  interface Conversation {
    id: string;
    platform: string;
    updated_at: string;
    project_name?: string;
    cwd?: string;
    codebase_id?: string;
  }

  let conversationId = '';
  let conversationList: Conversation[] = [];
  let historyMessages: any[] = [];
  let input = '';
  let pendingAttachments: { path: string; name: string }[] = [];
  let isUploading = false;
  let fileInput: HTMLInputElement;
  let messagesDiv: HTMLDivElement;
  let joined = false;
  let showControls = false;

  $: selectedConversation = conversationList.find(c => c.id === conversationId);
  $: selectedCodebaseId = selectedConversation?.codebase_id || null;

  // Search/Filter logic
  let showSearch = false;
  let searchTerm = '';

  $: filteredConversations = conversationList
    .filter(c => {
      const term = searchTerm.toLowerCase();
      return (
        c.platform.toLowerCase().includes(term) ||
        (c.project_name && c.project_name.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  function handleSelect(id: string) {
    conversationId = id;
    handleJoin();
    showSearch = false;
  }

  function handleSelectNew() {
    conversationId = 'default-' + Date.now();
    handleJoin();
    showSearch = false;
  }

  $: liveMessages = $messages.filter(
    m =>
      m.type === 'message' &&
      (!m.payload || !m.payload.conversationId || m.payload.conversationId === conversationId)
  );

  $: currentMessages = [...historyMessages, ...liveMessages];

  $: groupedConversations = conversationList.reduce(
    (acc, conv) => {
      const project = conv.project_name || 'Individual Chats';
      if (!acc[project]) acc[project] = [];
      acc[project].push(conv);
      return acc;
    },
    {} as Record<string, Conversation[]>
  );

  $: if ($status === 'connected' && conversationId && !joined) {
    wsJoin(conversationId);
    joined = true;
  }

  async function loadHistory(id: string) {
    if (!id) return;
    try {
      const history = await API.getMessages(id);
      historyMessages = history.map((m: any) => ({
        type: 'message',
        payload: {
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          conversationId: id,
        },
      }));
    } catch (e) {
      console.error('Failed to load history:', e);
      historyMessages = [];
    }
  }

  onMount(async () => {
    try {
      conversationList = await API.getConversations();
      if (conversationList.length > 0) {
        conversationId = conversationList[0].id;
        await loadHistory(conversationId);
      } else {
        // Create new ID if none exist (random or timestamp)
        conversationId = 'default-' + Date.now();
      }
      connect();
    } catch (e) {
      console.error(e);
    }
  });

  async function handleJoin() {
    joined = false; // Reset joined flag to trigger reactive join
    await loadHistory(conversationId);
  }

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    isUploading = true;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: API.getAuthHeader(),
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        pendingAttachments = [...pendingAttachments, { path: data.path, name: data.originalName }];
      } else {
        console.error('Upload failed:', data.error);
      }
    } catch (e) {
      console.error('Upload error:', e);
    } finally {
      isUploading = false;
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      uploadFile(input.files[0]);
    }
    input.value = ''; // Reset
  }

  function removeAttachment(index: number) {
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
  }

  function send() {
    if (!input.trim() && pendingAttachments.length === 0) return;
    sendMessage(
      conversationId,
      input,
      pendingAttachments.map(a => a.path)
    );
    input = '';
    pendingAttachments = [];
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleControlAction(event: CustomEvent<string>) {
    const content = event.detail;
    sendMessage(conversationId, content);
  }

  afterUpdate(() => {
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
</script>

<div class="chat-container">
  <div class="chat-header">
    <div class="conversation-select">
      {#if !showSearch}
        <button class="select-trigger" on:click={() => (showSearch = true)} type="button">
          <span class="trigger-label">
            {selectedConversation
              ? `${selectedConversation.platform} (${selectedConversation.project_name || 'Individual'})`
              : 'Select Session...'}
          </span>
          <svg viewBox="0 0 24 24" width="14" height="14"
            ><path fill="currentColor" d="M7 10l5 5 5-5z" /></svg
          >
        </button>
      {:else}
        <div class="search-dropdown glass">
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search sessions..."
            autoFocus
            on:blur={() => setTimeout(() => (showSearch = false), 200)}
          />
          <div class="search-results">
            <button
              class="result-item new"
              on:click={() => {
                handleSelectNew();
              }}
            >
              <span>+ New Session</span>
            </button>
            {#each filteredConversations as conv}
              <button class="result-item" on:click={() => handleSelect(conv.id)}>
                <span class="conv-platform">{conv.platform}</span>
                <span class="conv-Project">{conv.project_name || 'Individual'}</span>
                <span class="conv-time"
                  >{new Date(conv.updated_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}</span
                >
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    <div class="connection-status">
      <button
        class="controls-toggle {showControls ? 'active' : ''}"
        on:click={() => (showControls = !showControls)}
        title="Toggle tools"
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            fill="currentColor"
            d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.5 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
          />
        </svg>
      </button>
      <span class="indicator {$status}"></span>
      <span class="status-text">{$status}</span>
    </div>
  </div>

  {#if $status !== 'connected'}
    <div class="connection-banner {$status}">
      {#if $status === 'connecting'}
        <span>🔄 Reconnecting to server...</span>
      {:else}
        <span>⚠️ Disconnected. Connection lost.</span>
        <button on:click={connect}>Reconnect</button>
      {/if}
    </div>
  {/if}

  <div class="chat-main">
    <div class="chat-viewport">
      <div class="messages-list" bind:this={messagesDiv}>
        {#each currentMessages as msg}
          <div class="message-wrapper {msg.payload.role}">
            <div class="message-bubble shadow">
              <div class="content">{msg.payload.content}</div>
              <div class="meta">
                {new Date(msg.payload.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        {/each}
        {#if currentMessages.length === 0}
          <div class="empty-state">
            <p>No messages yet. Start by typing below.</p>
          </div>
        {/if}
      </div>

      <div class="input-container">
        <div class="input-wrapper glass">
          {#if pendingAttachments.length > 0}
            <div class="attachments-preview">
              {#each pendingAttachments as att, i}
                <span class="badgex">
                  📎 {att.name}
                  <button on:click={() => removeAttachment(i)}>×</button>
                </span>
              {/each}
            </div>
          {/if}

          <input
            type="file"
            bind:this={fileInput}
            hidden
            on:change={handleFileSelect}
            accept="image/*,text/*"
          />

          <button
            class="upload-btn"
            on:click={() => fileInput.click()}
            disabled={isUploading}
            title="Attach file"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"
              />
            </svg>
          </button>

          <textarea
            bind:value={input}
            on:keydown={handleKey}
            placeholder="Ask the Remote Agent..."
            rows="1"
          ></textarea>
          <button
            class="send-btn"
            on:click={send}
            disabled={$status !== 'connected' || (!input.trim() && pendingAttachments.length === 0)}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    {#if showControls}
      <div class="chat-controls glass shadow">
        <ContextSelector {selectedCodebaseId} on:select={handleControlAction} />
        <CommandPalette {conversationId} on:select={handleControlAction} />
      </div>
    {/if}
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary);
  }

  .chat-header {
    height: var(--header-height);
    padding: 0 var(--gap-md);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-tertiary);
  }

  .conversation-select {
    position: relative;
    min-width: 200px;
  }

  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-secondary);
    width: 100%;
    text-align: left;
    font-family: inherit;
  }

  .select-trigger:hover {
    border-color: var(--accent-blue);
    color: var(--text-primary);
  }

  .search-dropdown {
    position: absolute;
    top: 0;
    left: 0;
    width: 300px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    z-index: 100;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .search-dropdown input {
    width: 100%;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-subtle);
    color: white;
    padding: 6px;
    border-radius: 4px;
    margin-bottom: 4px;
    outline: none;
  }

  .search-dropdown input:focus {
    border-color: var(--accent-blue);
  }

  .search-results {
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
  }

  .result-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
  }

  .result-item.new {
    color: var(--accent-green);
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 2px;
  }

  .conv-platform {
    font-weight: 500;
    flex: 1;
  }

  .conv-Project {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .conv-time {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .indicator.connected {
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--accent-green);
  }
  .indicator.connecting {
    background: var(--accent-orange);
  }
  .indicator.disconnected {
    background: var(--error-red);
  }

  .status-text {
    font-size: 0.75rem;
    text-transform: capitalize;
    color: var(--text-muted);
  }

  .controls-toggle {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    margin-right: 8px;
    border-radius: 6px;
    display: flex;
    transition: var(--transition-fast);
  }

  .controls-toggle:hover,
  .controls-toggle.active {
    color: var(--accent-blue);
    background: rgba(14, 99, 156, 0.1);
  }

  .chat-main {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  .chat-viewport {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .messages-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--gap-md);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scroll-behavior: smooth;
  }

  .message-wrapper {
    display: flex;
    width: 100%;
  }

  .message-wrapper.user {
    justify-content: flex-end;
  }
  .message-wrapper.assistant {
    justify-content: flex-start;
  }

  .message-bubble {
    max-width: 85%;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    position: relative;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .message-wrapper.user .message-bubble {
    background: var(--accent-blue);
    color: white;
    border-bottom-right-radius: 2px;
  }

  .message-wrapper.assistant .message-bubble {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-bottom-left-radius: 4px;
  }

  .chat-controls {
    width: 280px;
    border-left: 1px solid var(--border-subtle);
    background: var(--bg-secondary);
    padding: var(--gap-md);
    display: flex;
    flex-direction: column;
    gap: var(--gap-lg);
    overflow-y: auto;
    z-index: 5;
  }

  @media (max-width: 900px) {
    .chat-controls {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 100%;
      border-left: none;
    }
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .meta {
    font-size: 0.7rem;
    margin-top: 0.4rem;
    opacity: 0.6;
    text-align: right;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.9rem;
  }

  .input-container {
    padding: var(--gap-md);
    background: var(--bg-secondary);
  }

  .input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: var(--gap-sm);
    padding: 0.5rem;
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    transition: var(--transition-fast);
  }

  .input-wrapper:focus-within {
    border-color: var(--accent-blue);
    background: rgba(255, 255, 255, 0.05);
  }

  textarea {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    padding: 0.4rem;
    resize: none;
    outline: none;
    font-size: 0.95rem;
    max-height: 150px;
  }

  .send-btn {
    background: var(--accent-blue);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 8px;
    cursor: pointer;
    transition: var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-blue-hover);
    transform: scale(1.05);
  }

  .send-btn:disabled {
    background: var(--bg-primary);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .upload-btn {
    background: transparent;
    color: var(--text-muted);
    border: none;
    padding: 8px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
  }
  .upload-btn:hover {
    color: var(--accent-blue);
    background: rgba(255, 255, 255, 0.05);
  }

  .attachments-preview {
    width: 100%;
    margin-bottom: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .badgex {
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .badgex button {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
  }
  .badgex button:hover {
    color: var(--error-red);
  }

  .input-wrapper {
    flex-wrap: wrap;
  }

  .connection-banner {
    padding: 8px var(--gap-md);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    animation: slideDown 0.3s ease-out;
  }

  .connection-banner.connecting {
    background: var(--accent-orange);
    color: #1a1a1a;
  }

  .connection-banner.disconnected {
    background: var(--error-red);
    color: white;
  }

  .connection-banner button {
    background: rgba(0, 0, 0, 0.2);
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: inherit;
    font-weight: 500;
  }

  .connection-banner button:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
