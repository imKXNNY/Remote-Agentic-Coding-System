#!/usr/bin/env tsx

/**
 * Create Telegram Bot Guide
 *
 * Interactive guide to help users create a Telegram bot with BotFather
 * and configure environment variables
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function createBotGuide(): void {
  console.log('🤖 Telegram Bot Creation Guide');
  console.log('='.repeat(50));
  console.log();
  console.log('This guide will help you create a Telegram bot and get your API token.');
  console.log();

  // Step 1: Create bot with BotFather
  console.log('📱 Step 1: Create a Bot with BotFather');
  console.log('-'.repeat(50));
  console.log('1. Open Telegram and search for "@BotFather"');
  console.log('2. Start a chat with BotFather');
  console.log('3. Send the command: /newbot');
  console.log('4. Follow the prompts to:');
  console.log('   - Choose a name for your bot (e.g., "My Codex Bot")');
  console.log('   - Choose a username (must end with "bot", e.g., "mycodexbot")');
  console.log('5. BotFather will respond with your bot token');
  console.log('   - It looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
  console.log('   - IMPORTANT: Keep this token secret!');
  console.log();

  // Step 2: Configure bot settings
  console.log('⚙️  Step 2: Configure Bot Settings (Optional)');
  console.log('-'.repeat(50));
  console.log('You can customize your bot with BotFather:');
  console.log('- /setdescription - Set bot description');
  console.log('- /setabouttext - Set "About" text');
  console.log('- /setuserpic - Upload a profile picture');
  console.log('- /setcommands - Set command list (see below)');
  console.log();

  // Suggested commands
  console.log('💬 Suggested Commands for /setcommands:');
  console.log('-'.repeat(50));
  console.log('start - Start the bot and see welcome message');
  console.log('help - Show available commands and usage');
  console.log('setcwd - Set the working directory for code execution');
  console.log('getcwd - Display the current working directory');
  console.log('searchcwd - Search for directories in the workspace');
  console.log('reset - Reset the conversation (preserves working directory)');
  console.log();

  // Step 3: Get Codex credentials
  console.log('🔐 Step 3: Get Codex Credentials');
  console.log('-'.repeat(50));
  console.log('1. Run: codex login');
  console.log('2. Complete the authentication in your browser');
  console.log('3. Open your auth.json file:');
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  console.log(`   ${authPath}`);
  console.log('4. Copy the following values:');
  console.log('   - tokens.id_token');
  console.log('   - tokens.access_token');
  console.log('   - tokens.refresh_token');
  console.log('   - tokens.account_id');
  console.log();

  // Step 4: Get Browserbase credentials (optional)
  console.log('🌐 Step 4: Get Browserbase Credentials (Optional)');
  console.log('-'.repeat(50));
  console.log('For browser automation and screenshot features:');
  console.log('1. Visit: https://browserbase.com');
  console.log('2. Sign up for a free account');
  console.log('3. Create a new project');
  console.log('4. Get your API key and Project ID from the dashboard');
  console.log();
  console.log('Note: If you skip this step, browser automation features');
  console.log('      (including automatic frontend verification) will not work.');
  console.log();

  // Step 5: Create .env file
  console.log('📝 Step 5: Create .env File');
  console.log('-'.repeat(50));

  const envExamplePath = path.join(process.cwd(), '.env.example');
  const envPath = path.join(process.cwd(), '.env');

  if (fs.existsSync(envExamplePath)) {
    console.log('Copy .env.example to .env and fill in your values:');
    console.log();

    if (!fs.existsSync(envPath)) {
      try {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ Created .env file from .env.example');
        console.log();
      } catch (error) {
        console.error(`❌ Failed to copy .env.example: ${error}`);
      }
    }

    // Show .env.example content
    const envExample = fs.readFileSync(envExamplePath, 'utf-8');
    console.log('Your .env file should look like this:');
    console.log();
    console.log(envExample);
  } else {
    console.log('❌ .env.example file not found');
  }

  // Step 6: Test the configuration
  console.log('✅ Step 6: Test Your Configuration');
  console.log('-'.repeat(50));
  console.log('After filling in your .env file:');
  console.log();
  console.log('1. Validate configuration:');
  console.log('   npm run validate');
  console.log();
  console.log('2. Start the bot in development mode:');
  console.log('   npm run dev');
  console.log();
  console.log('3. Open Telegram and send a message to your bot');
  console.log();

  // Final notes
  console.log('📚 Additional Resources');
  console.log('-'.repeat(50));
  console.log('- Telegram Bot API: https://core.telegram.org/bots');
  console.log('- BotFather Commands: https://core.telegram.org/bots#botfather');
  console.log('- Codex Documentation: https://developers.openai.com/codex');
  console.log('- Browserbase Docs: https://docs.browserbase.com');
  console.log();

  console.log('🎉 You\'re all set! Good luck with your Codex Telegram bot!');
}

// Run the guide
createBotGuide();
