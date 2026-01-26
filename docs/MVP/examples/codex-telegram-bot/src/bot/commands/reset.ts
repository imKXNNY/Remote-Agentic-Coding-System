/**
 * /reset command handler
 * Clear session (preserves working directory)
 */

import { Context } from 'telegraf';
import { clearUserSession, getUserCwd } from '../../session/manager.js';

export async function resetCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  const cwd = getUserCwd(userId);
  clearUserSession(userId);

  await ctx.reply(
    '✅ **Session Reset**\n\n' +
    '🔄 Your conversation history has been cleared.\n' +
    `📁 Working directory preserved: \`${cwd}\`\n\n` +
    'A new thread will be created for your next message.',
    { parse_mode: 'Markdown' }
  );
}
