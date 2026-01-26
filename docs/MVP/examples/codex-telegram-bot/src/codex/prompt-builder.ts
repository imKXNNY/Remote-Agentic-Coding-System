/**
 * Enhanced Prompt Builder
 *
 * Builds prompts with automatic frontend verification instructions
 * Instructs Codex to use Stagehand MCP for screenshot capture
 */

/**
 * Build enhanced prompt with frontend verification protocol
 *
 * Appends instructions to capture screenshots when frontend code is modified
 *
 * @param userMessage - Original user message
 * @param cwd - Current working directory
 * @returns Enhanced prompt with verification instructions
 */
export function buildEnhancedPrompt(userMessage: string, cwd: string): string {
  const screenshotPath = `${cwd}/.codex-screenshots/`;

  const frontendVerificationProtocol = `

FRONTEND VERIFICATION PROTOCOL:
When making changes to frontend code (HTML, CSS, JavaScript, React, Vue, Next.js, etc.):
1. Implement the requested changes
2. Start the development server if not already running
3. Use stagehand_navigate to visit the modified pages (e.g., http://localhost:3000)
4. Use stagehand_screenshot to capture the pages you changed
5. Save all screenshots to: ${screenshotPath} with descriptive names
6. Verify the changes look correct
7. Include the screenshot filenames in your response

Example screenshot names:
- homepage-after-button-added.png
- login-form-validation.png
- dashboard-new-chart.png

This allows the user to visually verify your changes through Telegram.`;

  return `${userMessage}${frontendVerificationProtocol}`;
}

/**
 * Check if message appears to be frontend-related
 *
 * @param message - User message
 * @returns True if message seems to be about frontend development
 */
export function isFrontendRelated(message: string): boolean {
  const frontendKeywords = [
    'react',
    'vue',
    'angular',
    'html',
    'css',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'component',
    'ui',
    'button',
    'form',
    'page',
    'website',
    'web',
    'frontend',
    'client',
    'browser',
    'dom',
    'style',
    'layout',
  ];

  const lowerMessage = message.toLowerCase();
  return frontendKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Build prompt with conditional frontend verification
 *
 * Only adds frontend verification if the message appears frontend-related
 *
 * @param userMessage - Original user message
 * @param cwd - Current working directory
 * @returns Enhanced prompt (conditionally)
 */
export function buildSmartPrompt(userMessage: string, cwd: string): string {
  if (isFrontendRelated(userMessage)) {
    return buildEnhancedPrompt(userMessage, cwd);
  }
  return userMessage;
}
