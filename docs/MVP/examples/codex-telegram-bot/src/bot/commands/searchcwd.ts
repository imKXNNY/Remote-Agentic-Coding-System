/**
 * /searchcwd command handler
 * Search for directories in the workspace
 */

import { Context } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE_ROOT = '/workspace';
const MAX_RESULTS = 20;
const MAX_DEPTH = 5;

/**
 * Recursively search for directories matching query
 */
function searchDirectories(
  dir: string,
  query: string,
  depth: number = 0,
  results: string[] = []
): string[] {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) {
    return results;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break;

      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const dirName = entry.name.toLowerCase();
        const queryLower = query.toLowerCase();

        // Skip node_modules, .git, etc.
        if (dirName.startsWith('.') || dirName === 'node_modules') {
          continue;
        }

        // Check if directory name matches query
        if (dirName.includes(queryLower)) {
          results.push(fullPath);
        }

        // Recurse into subdirectory
        searchDirectories(fullPath, query, depth + 1, results);
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return results;
}

export async function searchcwdCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  // Extract query from command
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = messageText.split(' ').slice(1);

  if (args.length === 0) {
    await ctx.reply(
      '❌ Please provide a search query\n\n' +
      'Usage: /searchcwd <query>\n' +
      'Example: /searchcwd react'
    );
    return;
  }

  const query = args.join(' ').trim();

  if (!fs.existsSync(WORKSPACE_ROOT)) {
    await ctx.reply(
      `❌ Workspace directory not found: \`${WORKSPACE_ROOT}\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.reply('🔍 Searching directories...');

  const results = searchDirectories(WORKSPACE_ROOT, query);

  if (results.length === 0) {
    await ctx.reply(
      `No directories found matching "\`${query}\`"\n\n` +
      'Try a different search term or check your workspace.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const resultList = results.map((dir, i) => `${i + 1}. \`${dir}\``).join('\n');
  const message =
    `📁 **Found ${results.length} director${results.length === 1 ? 'y' : 'ies'}:**\n\n` +
    resultList +
    '\n\nTo use a directory, copy its path and run:\n/setcwd <path>';

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
