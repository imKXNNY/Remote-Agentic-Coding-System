import { CodexClient } from './codex';
import { EventEmitter } from 'events';

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn
}));

describe('CodexClient', () => {
  let client: CodexClient;
  let mockChildProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CodexClient();

    // Setup mock child process
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    
    // Default success behavior
    mockSpawn.mockReturnValue(mockChildProcess);
  });

  describe('Image Input Support (CLI Fallback)', () => {
    it('uses CLI when attachments are present', async () => {
      const generator = client.sendQuery('analyze this', '/tmp', undefined, ['image.png']);
      
      // Start generator - execution stops at `await import`
      const nextPromise = generator.next();
      
      // Wait for dynamic import to resolve and code to proceed to spawn
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // verify spawn
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', 'analyze this', '-i', 'image.png'],
        expect.objectContaining({ cwd: '/tmp' })
      );

      // Simulate output
      mockChildProcess.stdout.emit('data', 'Analysis result');
      
      // Simulate exit
      setTimeout(() => mockChildProcess.emit('close', 0), 10);

      const result = await nextPromise;
      expect(result.value).toEqual({ type: 'assistant', content: 'Analysis result' });
    });

    it('handles multiple attachments', async () => {
      const generator = client.sendQuery('prompt', '/cwd', undefined, ['a.png', 'b.png']);
      const nextPromise = generator.next();
      
      // Wait for execution to reach spawn
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate simple exit
      setTimeout(() => mockChildProcess.emit('close', 0), 10);
      
      const result = await nextPromise;
      expect(result.value).toBeDefined();
    });

    it('handles CLI failure', async () => {
      const generator = client.sendQuery('prompt', '/cwd', undefined, ['bad.png']);
      const nextPromise = generator.next();
      
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate failure
      mockChildProcess.stderr.emit('data', 'File not found');
      mockChildProcess.emit('close', 1);

      const result = await nextPromise;
      expect(result.value).toEqual({
        type: 'system',
        content: '⚠️ Codex CLI failed: File not found'
      });
    });
  });
});
