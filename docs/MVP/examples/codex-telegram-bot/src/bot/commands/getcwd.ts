/**
 * /getcwd command handler
 * Display current working directory
 */

import { Context } from 'telegraf';
import { getUserCwd } from '../../session/manager.js';

export async function getcwdCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  const cwd = getUserCwd(userId);

  await ctx.reply(
    `📁 **Current Working Directory:**\n\`${cwd}\`\n\n` +
    'To change directory, use: /setcwd <path>',
    { parse_mode: 'Markdown' }
  );
}
