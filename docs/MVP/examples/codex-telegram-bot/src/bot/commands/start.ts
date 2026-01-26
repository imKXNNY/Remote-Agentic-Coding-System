/**
 * /start command handler
 * Welcome message with bot capabilities
 */

import { Context } from 'telegraf';

export async function startCommand(ctx: Context): Promise<void> {
  const welcomeMessage = `
🤖 **Welcome to Codex Telegram Bot!**

I'm your remote coding assistant powered by OpenAI Codex SDK. I can help you with:

✅ Write and modify code in any language
✅ Execute commands and scripts
✅ Browse and edit files in your workspace
✅ Capture screenshots of frontend changes (via Stagehand)
✅ Maintain conversation context per working directory

**Quick Start:**
1. Set your working directory: \`/setcwd /workspace/your-project\`
2. Start coding! Just send me what you want to build
3. I'll capture screenshots automatically when changing frontend code

**Available Commands:**
/help - Show all available commands
/setcwd - Set working directory
/getcwd - Show current directory
/searchcwd - Search for directories
/reset - Start a fresh conversation

Let's build something amazing! 🚀
  `.trim();

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}
