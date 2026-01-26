/**
 * Codex Telegram Bot
 *
 * Main entry point - initializes bot and registers handlers
 */

import { Telegraf } from 'telegraf';
import { getEnvironment } from './config/env.js';
import { startCommand } from './bot/commands/start.js';
import { helpCommand } from './bot/commands/help.js';
import { setcwdCommand } from './bot/commands/setcwd.js';
import { getcwdCommand } from './bot/commands/getcwd.js';
import { searchcwdCommand } from './bot/commands/searchcwd.js';
import { resetCommand } from './bot/commands/reset.js';
import { handleMessage } from './bot/handlers/message.js';

/**
 * Initialize and start the bot
 */
async function main() {
  console.log('🤖 Starting Codex Telegram Bot...');

  // Validate environment
  let config;
  try {
    config = getEnvironment();
    console.log('✅ Environment configuration validated');
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    process.exit(1);
  }

  // Create bot instance
  const bot = new Telegraf(config.telegramBotToken);

  // Register command handlers
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('setcwd', setcwdCommand);
  bot.command('getcwd', getcwdCommand);
  bot.command('searchcwd', searchcwdCommand);
  bot.command('reset', resetCommand);

  // Register message handler (for all non-command messages)
  bot.on('text', handleMessage);

  // Error handling
  bot.catch((error: any) => {
    console.error('Bot error:', error);
  });

  // Start bot
  try {
    await bot.launch();
    console.log('✅ Codex Telegram Bot is running!');
    console.log('Press Ctrl+C to stop');
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }

  // Enable graceful stop
  process.once('SIGINT', () => {
    console.log('\n🛑 SIGINT received, stopping bot...');
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received, stopping bot...');
    bot.stop('SIGTERM');
  });
}

// Run the bot
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
