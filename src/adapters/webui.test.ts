import { WebUIAdapter } from './webui';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';

// Mock WebSocket
const mockWs = {
  on: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN
} as unknown as WebSocket;

// Mock WebSocketServer
const mockWss = {
  on: jest.fn()
} as unknown as WebSocketServer;

describe('WebUIAdapter', () => {
  let adapter: WebUIAdapter;

  beforeEach(() => {
    adapter = new WebUIAdapter();
    adapter.setWebSocketServer(mockWss);
    jest.clearAllMocks();
  });

  it('implements IPlatformAdapter interface correctly', () => {
    expect(adapter.getPlatformType()).toBe('webui');
    expect(adapter.getStreamingMode()).toBe('stream');
  });

  it('handles client connection and joining', () => {
    const ws = { ...mockWs } as unknown as WebSocket;
    const req = {} as IncomingMessage;
    
    // Simulate connection
    adapter.handleConnection(ws, req);
    
    // Should register message handler
    expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    
    // Get the message handler
    const messageHandler = (ws.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
    
    // Simulate join message
    const joinMsg = JSON.stringify({ type: 'join', conversationId: '123' });
    messageHandler(Buffer.from(joinMsg));
    
    // internal state check is hard without exposing it, so we test behavior via broadcast
  });
  
  it('broadcasts messages to joined clients', async () => {
    const ws1 = { ...mockWs, send: jest.fn(), readyState: WebSocket.OPEN } as unknown as WebSocket;
    const ws2 = { ...mockWs, send: jest.fn(), readyState: WebSocket.OPEN } as unknown as WebSocket;
    const req = {} as IncomingMessage;

    adapter.handleConnection(ws1, req);
    adapter.handleConnection(ws2, req);

    const messageHandler1 = (ws1.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
    const messageHandler2 = (ws2.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];

    // Client 1 joins convo A
    messageHandler1(Buffer.from(JSON.stringify({ type: 'join', conversationId: 'A' })));
    
    // Client 2 joins convo B
    messageHandler2(Buffer.from(JSON.stringify({ type: 'join', conversationId: 'B' })));

    // Send message to convo A
    await adapter.sendMessage('A', 'Hello A');

    // WS1 should receive it
    expect(ws1.send).toHaveBeenCalled();
    const sentData1 = JSON.parse((ws1.send as jest.Mock).mock.calls[0][0]);
    expect(sentData1).toEqual({
      type: 'message',
      payload: {
        role: 'assistant',
        content: 'Hello A',
        timestamp: expect.any(Number)
      }
    });

    // WS2 should NOT receive it
    expect(ws2.send).not.toHaveBeenCalled();
  });

  it('removes client on disconnect', async () => {
    const ws = { ...mockWs, send: jest.fn(), readyState: WebSocket.OPEN } as unknown as WebSocket;
    const req = {} as IncomingMessage;

    adapter.handleConnection(ws, req);
    
    const messageHandler = (ws.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
    const closeHandler = (ws.on as jest.Mock).mock.calls.find(call => call[0] === 'close')[1];

    // Join
    messageHandler(Buffer.from(JSON.stringify({ type: 'join', conversationId: 'A' })));
    
    // Send message (should receive)
    await adapter.sendMessage('A', 'test 1');
    expect(ws.send).toHaveBeenCalledTimes(1);
    
    // Disconnect
    closeHandler();
    
    // Send message (should NOT receive)
    await adapter.sendMessage('A', 'test 2');
    expect(ws.send).toHaveBeenCalledTimes(1); // Still 1
  });
  it('invokes onMessage handler when client sends message', () => {
    const ws = { ...mockWs } as unknown as WebSocket;
    const req = {} as IncomingMessage;
    const handler = jest.fn();
    
    adapter.onMessage(handler);
    adapter.handleConnection(ws, req);
    
    const messageHandler = (ws.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
    
    // Simulate user message
    const msg = JSON.stringify({ 
        type: 'message', 
        conversationId: '123',
        content: 'Hello AI' 
    });
    messageHandler(Buffer.from(msg));
    
    expect(handler).toHaveBeenCalledWith('123', 'Hello AI');
  });
});
