import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handleMessage } from './orchestrator/orchestrator';
import { IPlatformAdapter } from './types';
import { pool } from './db/connection';
import { ensureSchemaCompatibility } from './db/schema';
import * as db from './db/conversations';
import * as messageDb from './db/messages';

/**
 * MCP Adapter for Remote Agentic Coding System
 * Collects responses to return as a single tool result
 */
class MCPAdapter implements IPlatformAdapter {
  private output: string[] = [];

  async sendMessage(_conversationId: string, message: string): Promise<void> {
    this.output.push(message);
  }

  getStreamingMode(): 'batch' | 'stream' {
    return 'batch'; // Collect all before returning tool result
  }

  getPlatformType(): string {
    return 'mcp';
  }

  async start(): Promise<void> {
    // No initialization needed for MCP
  }
  stop(): void {
    // No cleanup needed for MCP
  }
  getCombinedOutput(): string {
    return this.output.join('\n\n');
  }

  clear(): void {
    this.output = [];
  }
}

/**
 * Start the MCP server on stdio
 */
export async function startMcpServer(): Promise<void> {
  await pool.query('SELECT 1');
  await ensureSchemaCompatibility();

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const server = new Server(
    {
      name: 'remote-agent-codex',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  const adapter = new MCPAdapter();

  // --- Tools ---

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'send_query',
        description: 'Send a prompt or command to Codex in a specific workspace',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt or command' },
            conversationId: { type: 'string', description: 'Unique session ID (use same for persistence)' },
            cwd: { type: 'string', description: 'Optional: Overwrite working directory' },
          },
          required: ['prompt', 'conversationId'],
        },
      },
      {
        name: 'list_codebases',
        description: 'List all configured codebases/repositories',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'send_query') {
        const { prompt, conversationId, cwd } = args as { prompt: string; conversationId: string; cwd?: string };
        
        // Ensure conversation exists
        const conversation = await db.getOrCreateConversation('mcp', conversationId);

        // If CWD provided, update the conversation record
        if (cwd) {
          await db.updateConversation(conversation.id, { cwd });
        }
        
        adapter.clear();
        await handleMessage(adapter, conversationId, prompt);
        
        return {
          content: [{ type: 'text', text: adapter.getCombinedOutput() || 'No output received.' }],
        };
      }

      if (name === 'list_codebases') {
        const result = await pool.query('SELECT name, repository_url, default_cwd FROM remote_agent_codebases');
        return {
          content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  // --- Resources ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const result = await pool.query<{ id: string; platform_conversation_id: string }>(
      'SELECT id, platform_conversation_id FROM remote_agent_conversations WHERE platform_type = \'mcp\''
    );
    return {
      resources: result.rows.map((row) => ({
        uri: `codex://conversations/${row.platform_conversation_id}`,
        name: `Conversation ${row.platform_conversation_id}`,
        mimeType: 'text/markdown',
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const regex = /^codex:\/\/conversations\/(.+)$/;
    const match = regex.exec(uri);
    
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const platformConversationId = match[1];
    const conversation = await db.getOrCreateConversation('mcp', platformConversationId);

    const messages = await messageDb.getMessages(conversation.id);
    const content = messages.map(m => `**${m.role.toUpperCase()}**: ${m.content}`).join('\n\n');

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  });

  // Start transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server connected to stdio');
}
