/**
 * Main Message Handler
 *
 * Core message processing with Codex integration and streaming
 * Reference: telegram_bot.py lines 452-674
 */

import { Context } from 'telegraf';
import { getOrCreateSession, saveUserSession } from '../../session/manager.js';
import { getOrCreateThread, runStreaming } from '../../codex/client.js';
import {
  processItemCompleted,
  isItemCompleted,
  isTurnCompleted,
  formatError,
} from '../../codex/events.js';
import { sendLongMessage } from '../utils/message-splitter.js';
import { sendRecentScreenshots } from '../utils/screenshot-handler.js';

/**
 * Handle incoming text messages from users
 *
 * Main workflow:
 * 1. Load or create user session
 * 2. Get or create Codex thread
 * 3. Build enhanced prompt with frontend verification
 * 4. Stream Codex response
 * 5. Send messages to Telegram in real-time
 * 6. Send screenshots after completion
 * 7. Save updated session
 */
export async function handleMessage(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!messageText || messageText.trim() === '') {
    return;
  }

  try {
    // 1. Load or create session
    const session = getOrCreateSession(userId);
    const cwd = session.cwd;

    console.log(`Processing message from user ${userId} in ${cwd}`);

    // 2. Get or create thread (synchronous operation)
    let thread;
    try {
      thread = getOrCreateThread(session.thread_id, cwd);
      console.log(`Thread obtained: ${thread.id || 'new thread (ID assigned on first turn)'}`);
    } catch (error) {
      console.error('Error getting thread:', error);
      await ctx.reply(formatError(error));
      return;
    }

    // 3. Track conversation start time (for screenshot filtering)
    const conversationStartTime = new Date();

    // 4. Send typing indicator
    await ctx.sendChatAction('typing');

    // 5. Stream Codex response
    // NOTE: Global rules are now in AGENTS.md in the working directory
    // No need to enhance the prompt - just pass user message directly
    console.log(`Running streamed prompt on thread ${thread.id}`);

    let result;
    try {
      console.log("Running stream")
      result = await runStreaming(thread, messageText);
    } catch (error) {
      console.error('Error running streaming:', error);
      await ctx.reply(formatError(error));
      return;
    }

    // 6. Process streaming events
    const { events } = result;
    console.log(events)

    let lastTypingUpdate = Date.now();
    const typingInterval = 5000; // Send typing indicator every 5 seconds

    try {
      for await (const event of events) {
        console.log(event)

        // Update typing indicator periodically
        const now = Date.now();
        if (now - lastTypingUpdate > typingInterval) {
          await ctx.sendChatAction('typing');
          lastTypingUpdate = now;
        }

        // Handle error events
        if (event.type === 'error') {
          console.error('Stream error event:', event.message);

          // Don't send MCP timeout errors to Telegram (they're optional)
          // Only send actual errors that affect functionality
          if (!event.message.includes('MCP client')) {
            await ctx.reply(`⚠️ Error: ${event.message}`);
          }
          // Continue processing - don't break the stream
          continue;
        }

        // Handle turn failed events
        if (event.type === 'turn.failed') {
          console.error('Turn failed:', event.error.message);
          await ctx.reply(`❌ Turn failed: ${event.error.message}\n\nTry again or use /reset to start fresh.`);
          // Break - turn has failed
          break;
        }

        // Handle item completed events
        if (isItemCompleted(event)) {
          const processed = processItemCompleted(event);

          if (processed) {
            switch (processed.type) {
              case 'text':
                // Send agent message
                await sendLongMessage(ctx, processed.content);
                break;

              case 'tool':
                // Send tool usage notification
                await ctx.reply(processed.content);
                break;

              case 'thinking':
                // Optionally send thinking (currently skipped)
                // await ctx.reply(processed.content);
                break;
            }
          }
        }

        // Handle turn completed event
        if (isTurnCompleted(event)) {
          console.log('Turn completed, checking for screenshots');

          // Send screenshots
          await sendRecentScreenshots(ctx, cwd, conversationStartTime);

          // Save updated session with thread_id
          session.thread_id = thread.id;
          session.last_updated = new Date().toISOString();
          saveUserSession(userId, session);

          console.log(`Session saved for user ${userId} with thread ${thread.id}`);

          // IMPORTANT: Break out of event loop - turn is complete!
          // Without this, the loop waits for stream to end (which causes 90s timeout)
          break;
        }
      }
    } catch (error) {
      console.error('Error processing events:', error);
      await ctx.reply(
        formatError(error) +
        '\n\nThe conversation may have been interrupted. You can try again or use /reset to start fresh.'
      );
    }

  } catch (error) {
    console.error('Error in message handler:', error);
    await ctx.reply(
      formatError(error) +
      '\n\nSomething went wrong. Please try again or use /reset if the issue persists.'
    );
  }
}
