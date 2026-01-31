import { WebUIAdapter } from './webui';
import { IncomingMessage } from 'http';

// Mock ws module with a class to support static properties safely
jest.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1;
    
    // Instance methods/properties
    on = jest.fn();
    send = jest.fn();
    close = jest.fn();
    terminate = jest.fn();
    ping = jest.fn();
    readyState = 1; // Default to OPEN

    constructor() {
        // Any init if needed
    }
  }

  return {
    WebSocket: MockWebSocket,
    WebSocketServer: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      handleUpgrade: jest.fn(),
      clients: new Set()
    }))
  };
});

describe('WebUIAdapter', () => {
  let adapter: WebUIAdapter;
  // Function to get the most recent instance or create one
  // Since we use 'new WebSocket()' in the code? No, clients are passed in via handleConnection
  // So 'new WebSocket()' is NOT called by the code for *clients*.
  // Clients are created by the *server* (mocked implicitly) or passed in test.
  
  // We need to create mock instances that LOOK like the MockWebSocket class instances
  // OR we just rely on the structural typing since handleConnection takes 'WebSocket'.

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new WebUIAdapter();
  });

  afterEach(() => {
    adapter.stop();
  });
  
  // Helper to create a mock-like object that satisfies the adapter's checks
  const createMockWs = () => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    readyState: 1 // OPEN
  });

  it('handles client connection and joins conversation', () => {
    const mockWs = createMockWs();
    const req = {} as IncomingMessage;
    
    adapter.handleConnection(mockWs as any, req);

    const messageCall = mockWs.on.mock.calls.find((call: any[]) => call[0] === 'message');
    expect(messageCall).toBeDefined();
    
    const messageHandler = messageCall[1];
    const joinMsg = JSON.stringify({
      type: 'join',
      conversationId: 'test-conv-1'
    });
    
    messageHandler(Buffer.from(joinMsg));
    
    // Test broadcast
    adapter.sendMessage('test-conv-1', 'hello');
    
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('hello'));
  });

  it('broadcasts messages to joined clients', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const req = {} as IncomingMessage;

    adapter.handleConnection(ws1 as any, req);
    adapter.handleConnection(ws2 as any, req);

    const getHandler = (ws: any) => {
        const call = ws.on.mock.calls.find((c: any[]) => c[0] === 'message');
        if (!call) throw new Error('No message handler attached');
        return call[1];
    };

    const handler1 = getHandler(ws1);
    const handler2 = getHandler(ws2);

    handler1(Buffer.from(JSON.stringify({ type: 'join', conversationId: 'conv-A' })));
    handler2(Buffer.from(JSON.stringify({ type: 'join', conversationId: 'conv-B' })));

    adapter.sendMessage('conv-A', 'message for A');

    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).not.toHaveBeenCalled();
  });

  it('handles incoming messages from client', () => {
    const handler = jest.fn();
    adapter.onMessage(handler);
    
    const mockWs = createMockWs();
    adapter.handleConnection(mockWs as any, {} as IncomingMessage);
    
    const call = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'message');
    const msgHandler = call[1];
    
    const payload = {
      type: 'message',
      conversationId: 'conv-1',
      content: 'user input',
      attachments: ['file.txt']
    };
    
    msgHandler(Buffer.from(JSON.stringify(payload)));
    
    expect(handler).toHaveBeenCalledWith('conv-1', 'user input', ['file.txt']);
  });

  it('removes client on disconnect', () => {
    const mockWs = createMockWs();
    const req = {} as IncomingMessage;
    
    adapter.handleConnection(mockWs as any, req);

    const messageCall = mockWs.on.mock.calls.find((call: any[]) => call[0] === 'message');
    const messageHandler = messageCall[1];
    const joinMsg = JSON.stringify({
      type: 'join',
      conversationId: 'test-conv-1'
    });
    messageHandler(Buffer.from(joinMsg));

    const closeCall = mockWs.on.mock.calls.find((call: any[]) => call[0] === 'close');
    const closeHandler = closeCall[1];
    
    closeHandler();
    
    // Reset mock to check for calls after disconnect
    (mockWs.send as jest.Mock).mockClear();
    adapter.sendMessage('test-conv-1', 'hello');

    expect(mockWs.send).not.toHaveBeenCalled();
  });
});
