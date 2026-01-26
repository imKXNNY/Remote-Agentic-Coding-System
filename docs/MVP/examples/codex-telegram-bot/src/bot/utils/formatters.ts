/**
 * Message Formatters
 *
 * Format different types of messages for Telegram display
 */

/**
 * Format tool usage for display
 *
 * @param toolName - Name of the tool
 * @param toolInput - Tool input parameters
 * @returns Formatted tool usage message
 */
export function formatToolUsage(toolName: string, toolInput: any): string {
  let formatted = `🔧 **Tool: ${toolName}**\n`;

  if (typeof toolInput === 'string') {
    formatted += `\`${toolInput}\``;
  } else if (typeof toolInput === 'object') {
    const params = Object.entries(toolInput)
      .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
      .join('\n');
    formatted += `\`\`\`\n${params}\n\`\`\``;
  }

  return formatted;
}

/**
 * Format error message for Telegram
 *
 * @param error - Error object or message
 * @returns Formatted error message
 */
export function formatError(error: any): string {
  let message = '❌ **Error occurred**\n\n';

  if (typeof error === 'string') {
    message += error;
  } else if (error instanceof Error) {
    message += `${error.name}: ${error.message}`;
  } else if (error?.message) {
    message += error.message;
  } else {
    message += 'An unexpected error occurred';
  }

  return message;
}

/**
 * Format command execution for display
 *
 * @param command - Command that was executed
 * @returns Formatted command message
 */
export function formatCommand(command: string): string {
  return `🔧 **BASH**: \`${command}\``;
}

/**
 * Format code block for Telegram
 *
 * @param code - Code content
 * @param language - Programming language (optional)
 * @returns Formatted code block
 */
export function formatCodeBlock(code: string, language: string = ''): string {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Format status message
 *
 * @param status - Status text
 * @returns Formatted status message
 */
export function formatStatus(status: string): string {
  return `ℹ️ ${status}`;
}

/**
 * Format success message
 *
 * @param message - Success text
 * @returns Formatted success message
 */
export function formatSuccess(message: string): string {
  return `✅ ${message}`;
}

/**
 * Format warning message
 *
 * @param message - Warning text
 * @returns Formatted warning message
 */
export function formatWarning(message: string): string {
  return `⚠️ ${message}`;
}
