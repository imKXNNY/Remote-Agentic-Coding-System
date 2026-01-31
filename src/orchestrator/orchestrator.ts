/**
 * Orchestrator - Main conversation handler
 * Routes slash commands and AI messages appropriately
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { IPlatformAdapter } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as messageDb from '../db/messages';
import * as commandHandler from '../handlers/command-handler';
import { formatToolCall } from '../utils/tool-formatter';
import { substituteVariables } from '../utils/variable-substitution';
import { getAssistantClient } from '../clients/factory';

export async function handleMessage(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  issueContext?: string, // Optional GitHub issue/PR context to append AFTER command loading
  attachments: string[] = [] // Optional attachments (paths)
): Promise<void> {
  try {
    console.log(`[Orchestrator] Handling message for conversation ${conversationId}`);

    // Get or create conversation
    let conversation = await db.getOrCreateConversation(platform.getPlatformType(), conversationId);

    // SAVE User Message for history
    await messageDb.saveMessage(conversation.id, 'user', message);

    // Handle slash commands (except /command-invoke which needs AI)
    if (message.startsWith('/')) {
      if (!message.startsWith('/command-invoke')) {
        console.log(`[Orchestrator] Processing slash command: ${message}`);
        const result = await commandHandler.handleCommand(conversation, message);
        await platform.sendMessage(conversationId, result.message);

        // Reload conversation if modified
        if (result.modified) {
          conversation = await db.getOrCreateConversation(platform.getPlatformType(), conversationId);
        }
        return;
      }
      // /command-invoke falls through to AI handling
    }

    // Parse /command-invoke if applicable
    let promptToSend = message;
    let commandName: string | null = null;

    if (message.startsWith('/command-invoke')) {
      // Use parseCommand to properly handle quoted arguments
      // e.g., /command-invoke plan "here is the request" → args = ['plan', 'here is the request']
      const { args: parsedArgs } = commandHandler.parseCommand(message);

      if (parsedArgs.length < 1) {
        await platform.sendMessage(conversationId, 'Usage: /command-invoke <name> [args...]');
        return;
      }

      commandName = parsedArgs[0];
      const args = parsedArgs.slice(1);

      if (!conversation.codebase_id) {
        await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
        return;
      }

      // Look up command definition
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase) {
        await platform.sendMessage(conversationId, 'Codebase not found.');
        return;
      }

      const commandDef = codebase.commands[commandName];
      if (!commandDef) {
        await platform.sendMessage(
          conversationId,
          `Command '${commandName}' not found. Use /commands to see available.`
        );
        return;
      }

      // Read command file
      const cwd = conversation.cwd || codebase.default_cwd;
      const commandFilePath = join(cwd, commandDef.path);

      try {
        const commandText = await readFile(commandFilePath, 'utf-8');

        // Substitute variables (no metadata needed - file-based workflow)
        promptToSend = substituteVariables(commandText, args);

        // Append issue/PR context AFTER command loading (if provided)
        if (issueContext) {
          promptToSend = promptToSend + '\n\n---\n\n' + issueContext;
          console.log('[Orchestrator] Appended issue/PR context to command prompt');
        }

        console.log(`[Orchestrator] Executing '${commandName}' with ${args.length} args`);
      } catch (error) {
        const err = error as Error;
        await platform.sendMessage(conversationId, `Failed to read command file: ${err.message}`);
        return;
      }
    } else {
      // Regular message - require codebase
      if (!conversation.codebase_id) {
        await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
        return;
      }
    }

    console.log('[Orchestrator] Starting AI conversation');

    // Dynamically get the appropriate AI client based on conversation's assistant type
    const aiClient = getAssistantClient(conversation.ai_assistant_type);
    console.log(`[Orchestrator] Using ${conversation.ai_assistant_type} assistant`);

    // Get or create session (handle plan→execute transition)
    let session = await sessionDb.getActiveSession(conversation.id);
    const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
    const cwd = conversation.cwd || codebase?.default_cwd || '/workspace';

    // Check for plan→execute transition (requires NEW session per PRD)
    // Note: The planning command is named 'plan-feature', not 'plan'
    const needsNewSession = commandName === 'execute' && session?.metadata?.lastCommand === 'plan-feature';

    if (needsNewSession) {
      console.log('[Orchestrator] Plan→Execute transition: creating new session');

      if (session) {
        await sessionDb.deactivateSession(session.id);
      }

      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id,
        ai_assistant_type: conversation.ai_assistant_type,
      });
    } else if (!session) {
      console.log('[Orchestrator] Creating new session');
      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id,
        ai_assistant_type: conversation.ai_assistant_type,
      });
    } else {
      console.log(`[Orchestrator] Resuming session ${session.id}`);
    }

    // Send to AI and stream responses
    const mode = platform.getStreamingMode();
    console.log(`[Orchestrator] Streaming mode: ${mode}`);

    let fullAssistantResponse = '';
    const options = {
      model: conversation.model_id || undefined,
      sandbox: codebase?.sandbox_mode || 'workspace-write',
      additional_dirs: conversation.additional_dirs || undefined,
    };

    const startTime = Date.now();
    let firstTokenTime: number | null = null;

    if (mode === 'stream') {
      // Stream mode: Send each chunk immediately
      try {
        for await (const msg of aiClient.sendQuery(
          promptToSend,
          cwd,
          session.assistant_session_id || undefined,
          attachments,
          options
        )) {
          if (!firstTokenTime && msg.content) {
            firstTokenTime = Date.now();
          }

          if (msg.type === 'assistant' && msg.content) {
            fullAssistantResponse += msg.content;
            await platform.sendMessage(conversationId, msg.content);
          } else if (msg.type === 'tool' && msg.toolName) {
            // Format and send tool call notification
            const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
            await platform.sendMessage(conversationId, toolMessage);
          } else if (msg.type === 'result' && msg.sessionId) {
            // Save session ID for resume
            await sessionDb.updateSession(session.id, msg.sessionId);
          }
        }

        // Log Telemetry (Success)
        await import('../utils/telemetry').then(m => m.logTelemetry({
          conversation_id: conversation.id,
          assistant_type: conversation.ai_assistant_type,
          model_id: conversation.model_id || undefined,
          latency_to_first_token_ms: firstTokenTime ? firstTokenTime - startTime : undefined,
          latency_total_ms: Date.now() - startTime,
          status: 'success'
        }));
      } catch (error) {
         // Log Telemetry (Error)
         await import('../utils/telemetry').then(m => m.logTelemetry({
           conversation_id: conversation.id,
           assistant_type: conversation.ai_assistant_type,
           model_id: conversation.model_id || undefined,
           latency_total_ms: Date.now() - startTime,
           status: 'error',
           error_message: (error as Error).message
         }));
         throw error;
      }
    } else {
      // Batch mode: Accumulate all chunks for logging, send only final clean summary
      const allChunks: { type: string; content: string }[] = [];
      const assistantMessages: string[] = [];

      for await (const msg of aiClient.sendQuery(
        promptToSend,
        cwd,
        session.assistant_session_id || undefined,
        undefined,
        options
      )) {
        if (msg.type === 'assistant' && msg.content) {
          assistantMessages.push(msg.content);
          allChunks.push({ type: 'assistant', content: msg.content });
        } else if (msg.type === 'tool' && msg.toolName) {
          // Format and log tool call for observability
          const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
          allChunks.push({ type: 'tool', content: toolMessage });
          console.log(`[Orchestrator] Tool call: ${msg.toolName}`);
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }

      // Extract clean summary from the last message
      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const sections = lastMessage.split('\n\n');
        const toolIndicatorRegex = /^(?:\u{1F527}|\u{1F4AD}|\u{1F4DD}|\u{270F}\u{FE0F}|\u{1F5D1}\u{FE0F}|\u{1F4C2}|\u{1F50D})/u;
        const cleanSections = sections.filter(section => {
          const trimmed = section.trim();
          return !toolIndicatorRegex.exec(trimmed);
        });
        fullAssistantResponse = cleanSections.join('\n\n').trim() || lastMessage;
      }

      if (fullAssistantResponse) {
        console.log(`[Orchestrator] Sending final message (${fullAssistantResponse.length} chars)`);
        await platform.sendMessage(conversationId, fullAssistantResponse);
      }
    }

    // SAVE Assistant Message for history
    if (fullAssistantResponse) {
      await messageDb.saveMessage(conversation.id, 'assistant', fullAssistantResponse);
    }

    // Track last command in metadata (for plan→execute detection)
    if (commandName) {
      await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
    }

    console.log('[Orchestrator] Message handling complete');
  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    await platform.sendMessage(
      conversationId,
      '⚠️ An error occurred. Try /reset to start a fresh session.'
    );
  }
}
