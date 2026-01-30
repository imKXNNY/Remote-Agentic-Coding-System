import { IPlatformAdapter } from '../types';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';

interface WebUIEvent {
  type: 'message' | 'tool' | 'status' | 'file_change';
  payload: unknown;
}

export class WebUIAdapter implements IPlatformAdapter {
  private clients = new Map<string, Set<WebSocket>>();
  private wss: WebSocketServer | null = null;
  private messageHandler: ((conversationId: string, content: string) => void) | null = null;

  constructor() {
    this.clients = new Map();
  }

  setWebSocketServer(wss: WebSocketServer) {
    this.wss = wss;
    
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  onMessage(handler: (conversationId: string, content: string) => void) {
    this.messageHandler = handler;
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    console.log('[WebUI] New connection attempt');
    
    ws.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.type === 'join') {
          const conversationId = event.conversationId;
          this.addClient(conversationId, ws);
          console.log(`[WebUI] Client joined conversation ${conversationId}`);
        } else if (event.type === 'message') {
           if (this.messageHandler && event.conversationId && event.content) {
             this.messageHandler(event.conversationId, event.content);
           }
        }
      } catch (err) {
        console.error('[WebUI] Failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      this.removeClient(ws);
    });
  }

  private addClient(conversationId: string, ws: WebSocket) {
    if (!this.clients.has(conversationId)) {
      this.clients.set(conversationId, new Set());
    }
    this.clients.get(conversationId)?.add(ws);
  }

  private removeClient(ws: WebSocket) {
    for (const [id, clientSet] of this.clients.entries()) {
      if (clientSet.delete(ws)) {
        console.log(`[WebUI] Client disconnected from ${id}`);
        if (clientSet.size === 0) {
           this.clients.delete(id);
        }
      }
    }
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    this.broadcastToConversation(conversationId, {
      type: 'message',
      payload: {
        role: 'assistant',
        content: message,
        timestamp: Date.now()
      }
    });
  }
  
  broadcastToConversation(conversationId: string, event: WebUIEvent): void {
    const clients = this.clients.get(conversationId);
    if (!clients) return;

    const data = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  getStreamingMode(): 'stream' | 'batch' {
    return 'stream';
  }

  getPlatformType(): string {
    return 'webui';
  }

  async start(): Promise<void> {
    console.log('[WebUI] Adapter started');
  }

  stop(): void {
    console.log('[WebUI] Adapter stopping');
    this.clients.clear();
  }
}
