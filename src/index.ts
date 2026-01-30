/**
 * Remote Coding Agent - Main Entry Point
 * Telegram + Claude MVP
 */

// Load environment variables FIRST, before any other imports
import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { TelegramAdapter } from './adapters/telegram';
import { TestAdapter } from './adapters/test';
import { GitHubAdapter } from './adapters/github';
import { WebUIAdapter } from './adapters/webui';
import * as messageDb from './db/messages';
import * as codebaseDb from './db/codebases';
import { handleMessage } from './orchestrator/orchestrator';
import { pool } from './db/connection';
import { ConversationLockManager } from './utils/conversation-lock';
import { resolveWorkspacePath } from './utils/paths';

async function main(): Promise<void> {
  console.log('[App] Starting Remote Coding Agent (Telegram + Claude MVP)');

  // Validate required environment variables
  const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('[App] Missing required environment variables:', missing.join(', '));
    console.error('[App] Please check .env.example for required configuration');
    process.exit(1);
  }

  // Validate AI assistant credentials (warn if missing, don't fail)
  const hasClaudeCredentials = process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const hasCodexCredentials = process.env.CODEX_ID_TOKEN && process.env.CODEX_ACCESS_TOKEN;

  if (!hasClaudeCredentials && !hasCodexCredentials) {
    console.error('[App] No AI assistant credentials found. Set Claude or Codex credentials.');
    process.exit(1);
  }

  if (!hasClaudeCredentials) {
    console.warn('[App] Claude credentials not found. Claude assistant will be unavailable.');
  }
  if (!hasCodexCredentials) {
    console.warn('[App] Codex credentials not found. Codex assistant will be unavailable.');
  }

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log('[Database] Connected successfully');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    process.exit(1);
  }

  // Initialize conversation lock manager
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS || '10');
  const lockManager = new ConversationLockManager(maxConcurrent);
  console.log(`[App] Lock manager initialized (max concurrent: ${maxConcurrent})`);

  // Initialize test adapter
  const testAdapter = new TestAdapter();
  await testAdapter.start();

  // Initialize GitHub adapter (conditional)
  let github: GitHubAdapter | null = null;
  if (process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET) {
    github = new GitHubAdapter(process.env.GITHUB_TOKEN, process.env.WEBHOOK_SECRET);
    await github.start();
  } else {
    console.log('[GitHub] Adapter not initialized (missing GITHUB_TOKEN or WEBHOOK_SECRET)');
  }

  // Setup Express and HTTP server
  const app = express();
  const server = createServer(app);
  const port = process.env.PORT || 3000;

  // GitHub webhook endpoint (must use raw body for signature verification)
  // IMPORTANT: Register BEFORE express.json() to prevent body parsing
  if (github) {
    app.post('/webhooks/github', express.raw({ type: 'application/json' }), async (req, res) => {
      try {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) {
          return res.status(400).json({ error: 'Missing signature header' });
        }

        const payload = (req.body as Buffer).toString('utf-8');

        // Process async (fire-and-forget for fast webhook response)
        github.handleWebhook(payload, signature).catch(error => {
          console.error('[GitHub] Webhook processing error:', error);
        });

        return res.status(200).send('OK');
      } catch (error) {
        console.error('[GitHub] Webhook endpoint error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
    console.log('[Express] GitHub webhook endpoint registered');
  }

  // JSON parsing for all other endpoints
  app.use(express.json());

  // Health check endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/db', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (_error) {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  });

  app.get('/health/concurrency', (_req, res) => {
    try {
      const stats = lockManager.getStats();
      res.json({
        status: 'ok',
        ...stats
      });
    } catch (_error) {
      res.status(500).json({ status: 'error', reason: 'Failed to get stats' });
    }
  });

  // Test adapter endpoints
  app.post('/test/message', async (req, res) => {
    try {
      const { conversationId, message } = req.body;
      if (!conversationId || !message) {
        return res.status(400).json({ error: 'conversationId and message required' });
      }

      await testAdapter.receiveMessage(conversationId, message);

      // Process the message through orchestrator (non-blocking)
      lockManager
        .acquireLock(conversationId, async () => {
          await handleMessage(testAdapter, conversationId, message);
        })
        .catch(error => {
          console.error('[Test] Message handling error:', error);
        });

      return res.json({ success: true, conversationId, message });
    } catch (error) {
      console.error('[Test] Endpoint error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/test/messages/:conversationId', (req, res) => {
    const messages = testAdapter.getSentMessages(req.params.conversationId);
    res.json({ conversationId: req.params.conversationId, messages });
  });

  app.delete('/test/messages/:conversationId?', (req, res) => {
    testAdapter.clearMessages(req.params.conversationId);
    res.json({ success: true });
  });

  // --- WebUI Integration ---

  // Basic Auth Middleware
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = process.env.WEBUI_USER || 'admin';
    const pass = process.env.WEBUI_PASSWORD;

    if (!pass && process.env.NODE_ENV === 'production') {
      console.warn('[WebUI] WEBUI_PASSWORD not set in production');
      return res.status(500).send('Server configuration error');
    }
    
    // In dev, if no password set, warn but allow (or maybe better to generate one?)
    // For now we'll require it or fail, to be safe as per plan
    if (!pass) {
       console.warn('[WebUI] WEBUI_PASSWORD not set. WebUI disabled.');
       return res.status(503).send('WebUI disabled');
    }

    // SKIP authentication for WebSocket upgrades - it will be handled by the WS server manually
    // via subprotocols, to avoid Express middleware blocking browser upgrade requests.
    if (req.path.startsWith('/ws')) {
      return next();
    }

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    if (!b64auth) {
      res.set('WWW-Authenticate', 'Basic realm="Remote Agent WebUI"');
      return res.status(401).send('Authentication required.');
    }

    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === user && password === pass) {
      return next();
    }

    console.warn(`[WebUI] Auth failed for user: ${login}`);
    res.set('WWW-Authenticate', 'Basic realm="Remote Agent WebUI"');
    return res.status(401).send('Authentication required.');
  };

  // Initialize WebUI Adapter
  const webui = new WebUIAdapter();
  // We'll set the WSS later after creating it

  // Register Upload Route
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const uploadRouter = require('./routes/upload').default;
  app.use('/api', authMiddleware, uploadRouter);

  // Register GitHub Route
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const githubRouter = require('./routes/github').default;
  app.use('/api', authMiddleware, githubRouter);

  // API Routes (Protected)
  app.get('/api/conversations', authMiddleware, async (_req, res) => {
    try {
      // Assuming we can get list from DB - referencing db module
      // We might need to implement a list function in db/conversations
      // For now, let's just query the pool directly to avoid changing db module signatures if possible
      // or duplicate the logic here for MVP.
      const result = await pool.query(`
        SELECT 
          c.id, 
          c.platform_type as platform, 
          c.created_at, 
          c.updated_at, 
          c.cwd,
          b.name as project_name
        FROM remote_agent_conversations c
        LEFT JOIN remote_agent_codebases b ON c.codebase_id = b.id
        ORDER BY b.name NULLS LAST, c.updated_at DESC 
        LIMIT 50
      `);
      return res.json(result.rows);
    } catch (error) {
       console.error('[WebUI] Failed to fetch conversations:', error);
       return res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/codebases', authMiddleware, async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM remote_agent_codebases ORDER BY name ASC');
      return res.json(result.rows);
    } catch (error) {
      console.error('[WebUI] Failed to fetch codebases:', error);
      return res.status(500).json({ error: 'Failed to fetch codebases' });
    }
  });

  app.get('/api/conversations/:id/messages', authMiddleware, async (req, res) => {
    try {
      const messages = await messageDb.getMessages(req.params.id);
      return res.json(messages);
    } catch (error) {
      console.error('[WebUI] Failed to fetch messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/conversations/:id/commands', authMiddleware, async (req, res) => {
    try {
      const convResult = await pool.query('SELECT codebase_id FROM remote_agent_conversations WHERE id = $1', [req.params.id]);
      const codebaseId = convResult.rows[0]?.codebase_id;
      
      if (!codebaseId) {
        return res.json({});
      }
      
      const commands = await codebaseDb.getCodebaseCommands(codebaseId);
      return res.json(commands);
    } catch (error) {
      console.error('[WebUI] Failed to fetch commands:', error);
      return res.status(500).json({ error: 'Failed to fetch commands' });
    }
  });

  app.get('/api/files', authMiddleware, async (req, res) => {
    try {
      const relPath = (req.query.path as string) || '';
      
      // Prevent directory traversal
      if (relPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const fullPath = await resolveWorkspacePath(relPath);
      const statInfo = await stat(fullPath);

      if (!statInfo.isDirectory()) {
         return res.status(400).json({ error: 'Not a directory' });
      }

      const files = await readdir(fullPath, { withFileTypes: true });
      const listing = files.map(f => ({
        name: f.name,
        type: f.isDirectory() ? 'directory' : 'file',
        path: join(relPath, f.name).replace(/\\/g, '/')
      }));

      return res.json(listing);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to list files' });
    }
  });

  app.get('/api/files/content', authMiddleware, async (req, res) => {
    try {
       const relPath = (req.query.path as string) || '';

       if (relPath.includes('..')) return res.status(400).json({ error: 'Invalid path' });
       
       const fullPath = await resolveWorkspacePath(relPath);
       // Simple check if text file? Monaca handles many, let's just send content for MVP
       // Maybe size limit
       const statInfo = await stat(fullPath);
       if (statInfo.size > 1024 * 1024) { // 1MB limit
          return res.status(400).json({ error: 'File too large' });
       }
       
       const content = await readFile(fullPath, 'utf-8');
       return res.json({ content });
    } catch (error) {
       return res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // Serve Frontend Static Files
  // In production (Docker), these will be in ./webui/dist
  // Protected by auth? If we protect the whole "/" it prompts auth on load.
  app.use(authMiddleware, express.static('webui/dist'));
  app.get('*', authMiddleware, (_req, res, next) => {
      // Allow other API routes to pass
      if (_req.path.startsWith('/api/') || _req.path.startsWith('/ws')) return next();
      // Logic to resolve index.html
      // We need to define where it is.
      // If we are in dist/index.js, 'webui/dist' is relative to CWD.
      return res.sendFile(join(process.cwd(), 'webui/dist/index.html'));
  });

  // WebSocket Server
  const wss = new WebSocketServer({ 
    server, 
    path: '/ws'
  });
  
  // Trace all upgrade requests
  server.on('upgrade', (req, _socket, _head) => {
    console.log(`[WebSocket] Upgrade requested for: ${req.url} from ${req.socket.remoteAddress}`);
  });

  // Verify Auth on Connection (Upgrade)
  wss.on('connection', (ws, req) => {
     console.log('[WebSocket] Connection established. Verifying auth...');
     
     // Check auth from: Header OR Protocol OR Query Param
     let b64auth = (req.headers.authorization || '').split(' ')[1] || '';
     
     if (!b64auth) {
        // Parse from query param ?token=...
        try {
          const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
          b64auth = url.searchParams.get('token') || '';
          if (b64auth) console.log('[WebSocket] Auth token found in query params');
        } catch (e) {
          console.error('[WebSocket] Failed to parse URL for token:', e);
        }
     }

     if (!b64auth && req.headers['sec-websocket-protocol']) {
       const protocols = (req.headers['sec-websocket-protocol'] as string).split(',').map(p => p.trim());
       if (protocols.length >= 2 && protocols[0] === 'authorization') {
           b64auth = protocols[1];
       }
     }
     
     const user = process.env.WEBUI_USER || 'admin';
     const pass = process.env.WEBUI_PASSWORD;
     
     if (!pass) {
        console.error('[WebSocket] WEBUI_PASSWORD not set');
        ws.close(1011, 'Server configuration error');
        return;
     }

     if (!b64auth) {
        console.warn('[WebSocket] No credentials provided in handshake');
        ws.close(1008, 'Authentication required');
        return;
     }

     const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
     if (login !== user || password !== pass) {
        console.warn(`[WebSocket] Auth failed for user: ${login}`);
        ws.close(1008, 'Authentication failed');
        return;
     }
     
     console.log('[WebSocket] Authentication successful for user:', login);
     
     // Setup Heartbeat
     (ws as any).isAlive = true;
     ws.on('pong', () => { (ws as any).isAlive = true; });

     // Delegate to adapter
     webui.handleConnection(ws, req);
  });

  // WebSocket Heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
  
  // Handle incoming messages from WebUI
  webui.onMessage((conversationId, content, attachments) => {
      lockManager.acquireLock(conversationId, async () => {
          await handleMessage(webui, conversationId, content, undefined, attachments);
      });
  });

  server.listen(port, () => {
    console.log(`[Express] Server listening on port ${port}`);
  });

  // Initialize platform adapter (Telegram)
  const streamingMode = (process.env.TELEGRAM_STREAMING_MODE || 'stream') as 'stream' | 'batch';
  const telegram = new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN!, streamingMode);

  // Handle text messages
  telegram.getBot().on('text', async ctx => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;

    if (!message) return;

    // Send to Orchestrator
    // Fire-and-forget: handler returns immediately, processing happens async
    lockManager
      .acquireLock(conversationId, async () => {
        await handleMessage(telegram, conversationId, message);
      })
      .catch(error => {
        console.error('[Telegram] Failed to process message:', error);
      });
  });

  // Start bot
  await telegram.start();

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[App] Shutting down gracefully...');
    telegram.stop();
    pool.end().then(() => {
      console.log('[Database] Connection pool closed');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log('[App] Remote Coding Agent is ready!');
  console.log('[App] Send messages to your Telegram bot to get started');
  console.log('[App] Test endpoint available: POST http://localhost:' + port + '/test/message');
}

// Run the application
main().catch(error => {
  console.error('[App] Fatal error:', error);
  process.exit(1);
});
