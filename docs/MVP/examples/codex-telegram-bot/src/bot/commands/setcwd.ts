/**
 * /setcwd command handler
 * Set working directory and create new thread
 */

import { Context } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';
import { setUserCwd } from '../../session/manager.js';

export async function setcwdCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  // Extract path from command
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = messageText.split(' ').slice(1);

  if (args.length === 0) {
    await ctx.reply(
      '❌ Please provide a directory path\n\n' +
      'Usage: /setcwd <path>\n' +
      'Example: /setcwd /workspace/my-project'
    );
    return;
  }

  const newCwd = args.join(' ').trim();

  // Validate path exists
  if (!fs.existsSync(newCwd)) {
    await ctx.reply(
      `❌ Directory not found: \`${newCwd}\`\n\n` +
      'Please check the path and try again.\n' +
      'Use /searchcwd to find directories.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Validate it's a directory
  const stats = fs.statSync(newCwd);
  if (!stats.isDirectory()) {
    await ctx.reply(
      `❌ Path is not a directory: \`${newCwd}\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Set the new working directory (this clears thread_id)
  setUserCwd(userId, newCwd);

  await ctx.reply(
    `✅ Working directory set to:\n\`${newCwd}\`\n\n` +
    '🔄 A new conversation thread will be created for this directory.\n' +
    'Your previous conversations in other directories are preserved.',
    { parse_mode: 'Markdown' }
  );
}
