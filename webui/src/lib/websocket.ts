import { writable } from 'svelte/store';
import { API } from './api';

export const messages = writable<any[]>([]);
export const status = writable<'disconnected' | 'connecting' | 'connected'>('disconnected');

let ws: WebSocket | null = null;
let reconnectTimer: any = null;

export function connect() {
  if (ws) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host; // Includes port
  const auth = API.getAuthHeader()['Authorization']?.split(' ')[1] || '';
  
  // Pass token in URL to avoid subprotocol separator issues (like '=' padding)
  const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(auth)}`;
  
  status.set('connecting');
  
  try {
    // No subprotocols needed, using query param for auth
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.error('WS Init Error', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    status.set('connected');
    console.log('WS Connected');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      messages.update(m => [...m, data]);
    } catch (e) {
      console.error('WS Parse Error', e);
    }
  };

  ws.onclose = () => {
    status.set('disconnected');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error('WS Error', e);
    ws?.close();
  };
}

export function sendMessage(conversationId: string, text: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'message',
      conversationId,
      content: text
    }));
    
    // Optimistic update
    messages.update(m => [...m, {
         type: 'message', 
         payload: { role: 'user', content: text, timestamp: Date.now() } 
    }]);
  } else {
    console.warn('WS not connected');
  }
}

export function joinConversation(conversationId: string) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'join',
            conversationId
        }));
    }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

// Check adapter message handling
// In WebUIAdapter.handleConnection -> messageHandler -> 
// const data = JSON.parse(msg);
// if (type === 'join') ...
// if (type === 'message') { orchestrator.handleMessage(payload.conversationId, payload.content) }
