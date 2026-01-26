/**
 * /help command handler
 * Show available commands and usage examples
 */

import { Context } from 'telegraf';

export async function helpCommand(ctx: Context): Promise<void> {
  const helpMessage = `
📚 **Codex Telegram Bot - Command Reference**

**Session Management:**
\`/start\` - Welcome message and quick start guide
\`/help\` - Show this help message
\`/reset\` - Clear conversation history (preserves working directory)

**Working Directory:**
\`/setcwd <path>\` - Set working directory
  Example: \`/setcwd /workspace/my-project\`
  Note: Creates a new conversation thread for the directory

\`/getcwd\` - Display current working directory

\`/searchcwd <query>\` - Search for directories in workspace
  Example: \`/searchcwd react\`

**How to Use:**

1️⃣ **Set Your Working Directory**
\`/setcwd /workspace/your-project\`

2️⃣ **Start Coding**
Just send me natural language requests:
- "Create a React component for a login form"
- "Add error handling to the API endpoint"
- "Fix the CSS styling on the homepage"

3️⃣ **Frontend Changes**
For frontend work, I'll automatically:
- Start the dev server if needed
- Navigate to modified pages
- Capture screenshots
- Send them to you for visual verification

4️⃣ **View Screenshots**
All screenshots are saved to:
\`{your-cwd}/.codex-screenshots/\`

**Tips:**
💡 Each working directory has its own conversation thread
💡 Use /reset to start fresh without changing directory
💡 I can read, write, and execute code in your workspace
💡 Screenshots help you verify frontend changes remotely

Need help? Just ask me anything! 🚀
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}
