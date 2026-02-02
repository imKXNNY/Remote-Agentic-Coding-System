/**
 * Remote Coding Agent - Main Entry Point
 * Telegram + Claude MVP
 */

// Load environment variables FIRST, before any other imports
import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { join } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { TelegramAdapter } from './adapters/telegram';
import { message } from 'telegraf/filters';
import { TestAdapter } from './adapters/test';
import { GitHubAdapter } from './adapters/github';
import { WebUIAdapter } from './adapters/webui';
import * as messageDb from './db/messages';
import * as codebaseDb from './db/codebases';
import { handleMessage } from './orchestrator/orchestrator';
import { pool } from './db/connection';
import { ensureSchemaCompatibility } from './db/schema';
import { ConversationLockManager } from './utils/conversation-lock';
import { resolveWorkspacePath } from './utils/paths';
import { startMcpServer } from './mcp-server';
import uploadRouter from './routes/upload';
import githubRouter from './routes/github';
import { asyncHandler } from './utils/async-handler';

// Extended WebSocket for heartbeat
interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

async function main(): Promise<void> {
  const isMcpMode = process.argv.includes('--mcp');
  
  if (isMcpMode) {
    console.error('[App] Starting in MCP Mode');
    await startMcpServer();
    return;
  }

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
  const claudeApiKey = process.env.CLAUDE_API_KEY?.trim();
  const claudeOauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  const hasClaudeCredentials = Boolean(claudeApiKey || claudeOauthToken);
  const hasCodexCredentials = Boolean(process.env.CODEX_ID_TOKEN && process.env.CODEX_ACCESS_TOKEN);

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
    await ensureSchemaCompatibility();
    console.log('[Database] Connected successfully');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    process.exit(1);
  }

  // Initialize conversation lock manager
  const maxConcurrentRaw = process.env.MAX_CONCURRENT_CONVERSATIONS ?? '10';
  const parsedMaxConcurrent = Number.parseInt(maxConcurrentRaw, 10);
  const maxConcurrent =
    Number.isFinite(parsedMaxConcurrent) && parsedMaxConcurrent > 0
      ? parsedMaxConcurrent
      : 10;
  if (maxConcurrent !== parsedMaxConcurrent) {
    console.warn(
      `[App] Invalid MAX_CONCURRENT_CONVERSATIONS="${maxConcurrentRaw}". Falling back to ${String(maxConcurrent)}.`
    );
  }
  const lockManager = new ConversationLockManager(maxConcurrent);
  console.log(`[App] Lock manager initialized (max concurrent: ${String(maxConcurrent)})`);

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
  const portRaw = process.env.PORT ?? '3000';
  const parsedPort = Number.parseInt(portRaw, 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  if (port !== parsedPort) {
    console.warn(`[App] Invalid PORT="${portRaw}". Falling back to ${String(port)}.`);
  }

  // GitHub webhook endpoint (must use raw body for signature verification)
  // IMPORTANT: Register BEFORE express.json() to prevent body parsing
  if (github) {
    app.post('/webhooks/github', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
      try {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) {
          res.status(400).json({ error: 'Missing signature header' });
          return;
        }

        const payload = (req.body as Buffer).toString('utf-8');

        // Process async (fire-and-forget for fast webhook response)
        github.handleWebhook(payload, signature).catch(error => {
          console.error('[GitHub] Webhook processing error:', error);
        });

        res.status(200).send('OK');
      } catch (error) {
        console.error('[GitHub] Webhook endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }));
    console.log('[Express] GitHub webhook endpoint registered');
  }

  // JSON parsing for all other endpoints
  app.use(express.json());

  // Health check endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/db', asyncHandler(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (_error) {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  }));

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
  app.post('/test/message', asyncHandler(async (req, res) => {
    try {
      const body = req.body as { conversationId?: string; message?: string };
      const conversationId = body.conversationId;
      const message = body.message;
      if (!conversationId || !message) {
        res.status(400).json({ error: 'conversationId and message required' });
        return;
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

      res.json({ success: true, conversationId, message });
    } catch (error) {
      console.error('[Test] Endpoint error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }));

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
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const user = process.env.WEBUI_USER ?? 'admin';
    const pass = process.env.WEBUI_PASSWORD;

    if (!pass && process.env.NODE_ENV === 'production') {
      console.warn('[WebUI] WEBUI_PASSWORD not set in production');
      res.status(500).send('Server configuration error');
      return;
    }
    
    // In dev, if no password set, warn but allow
    if (!pass) {
       console.warn('[WebUI] WEBUI_PASSWORD not set. WebUI disabled.');
       res.status(503).send('WebUI disabled');
       return;
    }

    // SKIP authentication for WebSocket upgrades
    if (req.path.startsWith('/ws')) {
      next();
      return;
    }

    const authHeader = req.headers.authorization ?? '';
    const b64auth = authHeader.split(' ')[1] ?? '';
    if (!b64auth) {
      res.set('WWW-Authenticate', 'Basic realm="Remote Agent WebUI"');
      res.status(401).send('Authentication required.');
      return;
    }

    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === user && password === pass) {
      next();
      return;
    }

    console.warn(`[WebUI] Auth failed for user: ${login}`);
    res.set('WWW-Authenticate', 'Basic realm="Remote Agent WebUI"');
    res.status(401).send('Authentication required.');
  };

  // Initialize WebUI Adapter
  const webui = new WebUIAdapter();

  // Register Upload Route
  app.use('/api', authMiddleware, uploadRouter);

  // Register GitHub Route
  app.use('/api', authMiddleware, githubRouter);

  // API Routes (Protected)
  app.get('/api/conversations', authMiddleware, asyncHandler(async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          c.id, 
          c.platform_type as platform, 
          c.created_at, 
          c.updated_at, 
          c.cwd,
          c.additional_dirs,
          b.name as project_name
        FROM remote_agent_conversations c
        LEFT JOIN remote_agent_codebases b ON c.codebase_id = b.id
        ORDER BY b.name NULLS LAST, c.updated_at DESC 
        LIMIT 50
      `);
      res.json(result.rows);
    } catch (error) {
       console.error('[WebUI] Failed to fetch conversations:', error);
       res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  }));

  app.get('/api/codebases', authMiddleware, asyncHandler(async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM remote_agent_codebases ORDER BY name ASC');
      res.json(result.rows);
    } catch (error) {
      console.error('[WebUI] Failed to fetch codebases:', error);
      res.status(500).json({ error: 'Failed to fetch codebases' });
    }
  }));

  app.get('/api/conversations/:id/messages', authMiddleware, asyncHandler(async (req, res) => {
    try {
      const messages = await messageDb.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error('[WebUI] Failed to fetch messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }));

  app.get('/api/stats', authMiddleware, asyncHandler(async (_req, res) => {
    try {
      const { getStats } = await import('./utils/telemetry');
      const stats = await getStats();
      res.json(stats);
    } catch (error) {
      console.error('[WebUI] Failed to fetch stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }));

  app.get('/api/conversations/:id/commands', authMiddleware, asyncHandler(async (req, res) => {
    try {
      const convResult = await pool.query<{ codebase_id: string | null }>(
        'SELECT codebase_id FROM remote_agent_conversations WHERE id = $1',
        [req.params.id]
      );
      const codebaseId = convResult.rows[0]?.codebase_id;
      
      if (!codebaseId) {
        res.json({});
        return;
      }
      
      const commands = await codebaseDb.getCodebaseCommands(codebaseId);
      res.json(commands);
    } catch (error) {
      console.error('[WebUI] Failed to fetch commands:', error);
      res.status(500).json({ error: 'Failed to fetch commands' });
    }
  }));

  app.get('/api/files', authMiddleware, asyncHandler(async (req, res) => {
    try {
      const relPathParam = req.query.path;
      const relPath = typeof relPathParam === 'string' ? relPathParam : '';
      
      if (relPath.includes('..')) {
        res.status(400).json({ error: 'Invalid path' });
        return;
      }

      const fullPath = await resolveWorkspacePath(relPath);
      const statInfo = await stat(fullPath);

      if (!statInfo.isDirectory()) {
         res.status(400).json({ error: 'Not a directory' });
         return;
      }

      const files = await readdir(fullPath, { withFileTypes: true });
      const listing = files.map(f => ({
        name: f.name,
        type: f.isDirectory() ? 'directory' : 'file',
        path: join(relPath, f.name).replace(/\\/g, '/')
      }));

      res.json(listing);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to list files' });
    }
  }));

  app.get('/api/files/content', authMiddleware, asyncHandler(async (req, res) => {
    try {
       const relPathParam = req.query.path;
       const relPath = typeof relPathParam === 'string' ? relPathParam : '';

       if (relPath.includes('..')) {
         res.status(400).json({ error: 'Invalid path' });
         return;
       }
       
       const fullPath = await resolveWorkspacePath(relPath);
       const statInfo = await stat(fullPath);
       if (statInfo.size > 1024 * 1024) { 
          res.status(400).json({ error: 'File too large' });
          return;
       }
       
       const content = await readFile(fullPath, 'utf-8');
       res.json({ content });
    } catch (_error) {
       res.status(500).json({ error: 'Failed to read file' });
    }
  }));

  // Serve Frontend Static Files
  app.use(authMiddleware, express.static('webui/dist'));
  app.get('*', authMiddleware, (_req, res, next) => {
      if (_req.path.startsWith('/api/') || _req.path.startsWith('/ws')) {
        next();
        return;
      }
      res.sendFile(join(process.cwd(), 'webui/dist/index.html'));
  });

  // WebSocket Server
  const wss = new WebSocketServer({ 
    server, 
    path: '/ws'
  });
  
  server.on('upgrade', (req, _socket, _head) => {
    const requestedUrl = req.url ?? '';
    const remoteAddress = req.socket.remoteAddress ?? 'unknown';
    console.log(`[WebSocket] Upgrade requested for: ${requestedUrl} from ${remoteAddress}`);
  });

  // Verify Auth on Connection (Upgrade)
  wss.on('connection', (ws, req) => {
     console.log('[WebSocket] Connection established. Verifying auth...');
     
     const headerAuth = req.headers.authorization ?? '';
     let b64auth = headerAuth.split(' ')[1] ?? '';
     
     if (!b64auth) {
        try {
          const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
          b64auth = url.searchParams.get('token') ?? '';
          if (b64auth) console.log('[WebSocket] Auth token found in query params');
        } catch (e) {
          console.error('[WebSocket] Failed to parse URL for token:', e);
        }
     }

     if (!b64auth && req.headers['sec-websocket-protocol']) {
       const protocolHeader = req.headers['sec-websocket-protocol'] as string | string[] | undefined;
       const header = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
       if (typeof header === 'string') {
         const protocols = header.split(',').map(p => p.trim());
         if (protocols.length >= 2 && protocols[0] === 'authorization') {
             b64auth = protocols[1];
         }
       }
     }
     
     const user = process.env.WEBUI_USER ?? 'admin';
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
     (ws as unknown as ExtWebSocket).isAlive = true;
     ws.on('pong', () => { (ws as unknown as ExtWebSocket).isAlive = true; });

     // Delegate to adapter
     webui.handleConnection(ws, req);
  });

  // WebSocket Heartbeat
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const extWs = client as unknown as ExtWebSocket;
      if (!extWs.isAlive) {
        extWs.terminate();
        return;
      }
      
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
  
  // Handle incoming messages from WebUI
  webui.onMessage((conversationId, content, attachments) => {
      lockManager.acquireLock(conversationId, async () => {
          await handleMessage(webui, conversationId, content, undefined, attachments).catch(e => {
            console.error('[WebUI] Message handling error:', e);
          });
      }).catch(e => {
        console.error('[WebUI] Lock acquisition error:', e);
      });
  });

  server.listen(port, () => {
    console.log(`[Express] Server listening on port ${String(port)}`);
  });

  // Initialize platform adapter (Telegram)
  const streamingModeRaw = process.env.TELEGRAM_STREAMING_MODE ?? 'stream';
  const streamingMode: 'stream' | 'batch' =
    streamingModeRaw === 'batch' ? 'batch' : 'stream';
  if (streamingModeRaw !== 'stream' && streamingModeRaw !== 'batch') {
    console.warn(
      `[App] Invalid TELEGRAM_STREAMING_MODE="${streamingModeRaw}". Falling back to "stream".`
    );
  }
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }
  const telegram = new TelegramAdapter(telegramToken, streamingMode);

  // Handle text messages
  telegram.getBot().on(message('text'), async ctx => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;

    if (!message) return;

    // Send to Orchestrator
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
    }).catch(_e => process.exit(1));
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log('[App] Remote Coding Agent is ready!');
  console.log('[App] Send messages to your Telegram bot to get started');
  console.log(`[App] Test endpoint available: POST http://localhost:${String(port)}/test/message`);
}

// Run the application
main().catch(error => {
  console.error('[App] Fatal error:', error);
  process.exit(1);
});
