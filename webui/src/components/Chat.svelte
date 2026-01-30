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

  interface Conversation {
    id: string;
    platform: string;
    updated_at: string;
    project_name?: string;
    cwd?: string;
  }

  let conversationId = '';
  let conversationList: Conversation[] = [];
  let input = '';
  let messagesDiv: HTMLDivElement;
  let joined = false;

  $: currentMessages = $messages.filter(
    m =>
      m.type === 'message' &&
      (!m.payload || !m.payload.conversationId || m.payload.conversationId === conversationId)
  );

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

  onMount(async () => {
    try {
      conversationList = await API.getConversations();
      if (conversationList.length > 0) {
        conversationId = conversationList[0].id;
      } else {
        // Create new ID if none exist (random or timestamp)
        conversationId = 'default-' + Date.now();
      }
      connect();
    } catch (e) {
      console.error(e);
    }
  });

  function handleJoin() {
    joined = false; // Reset joined flag to trigger reactive join
  }

  function send() {
    if (!input.trim()) return;
    sendMessage(conversationId, input);
    input = '';
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  afterUpdate(() => {
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
</script>

<div class="chat-container">
  <div class="chat-header">
    <div class="conversation-select">
      <select bind:value={conversationId} on:change={handleJoin}>
        {#each Object.entries(groupedConversations) as [project, conversations]}
          <optgroup label={project}>
            {#each conversations as conv}
              <option value={conv.id}
                >{conv.platform} (Last active: {new Date(conv.updated_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })})</option
              >
            {/each}
          </optgroup>
        {/each}
        {#if conversationList.length === 0}
          <option value={conversationId}>New Session</option>
        {/if}
      </select>
    </div>
    <div class="connection-status">
      <span class="indicator {$status}"></span>
      <span class="status-text">{$status}</span>
    </div>
  </div>

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
      <textarea
        bind:value={input}
        on:keydown={handleKey}
        placeholder="Ask the Remote Agent..."
        rows="1"
      ></textarea>
      <button
        class="send-btn"
        on:click={send}
        disabled={$status !== 'connected' || !input.trim()}
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
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

  select {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 2px 4px;
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
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
    color: var(--text-primary);
    border-bottom-left-radius: 2px;
    border: 1px solid var(--border-subtle);
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
</style>
