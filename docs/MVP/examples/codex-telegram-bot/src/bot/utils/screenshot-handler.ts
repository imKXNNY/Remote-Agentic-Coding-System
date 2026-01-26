/**
 * Screenshot Handler
 *
 * Scans for new screenshots and sends them to Telegram
 */

import * as fs from 'fs';
import * as path from 'path';
import { Context } from 'telegraf';

/**
 * Screenshot metadata
 */
interface Screenshot {
  name: string;
  path: string;
  mtime: Date;
}

/**
 * Send recent screenshots to Telegram
 *
 * Scans the .codex-screenshots directory and sends any screenshots
 * created after the conversation start time
 *
 * @param ctx - Telegram context
 * @param cwd - Current working directory
 * @param conversationStartTime - When the conversation started
 */
export async function sendRecentScreenshots(
  ctx: Context,
  cwd: string,
  conversationStartTime: Date
): Promise<void> {
  const screenshotDir = path.join(cwd, '.codex-screenshots');

  // Check if screenshot directory exists
  if (!fs.existsSync(screenshotDir)) {
    console.log('Screenshot directory does not exist, skipping');
    return;
  }

  try {
    // Read all files in screenshot directory
    const files = fs.readdirSync(screenshotDir);

    // Filter for image files
    const imageFiles = files.filter(f =>
      f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
    );

    if (imageFiles.length === 0) {
      console.log('No screenshots found in directory');
      return;
    }

    // Get screenshot metadata
    const screenshots: Screenshot[] = imageFiles.map(name => {
      const screenshotPath = path.join(screenshotDir, name);
      const stats = fs.statSync(screenshotPath);
      return {
        name,
        path: screenshotPath,
        mtime: stats.mtime,
      };
    });

    // Filter screenshots created after conversation start
    const recentScreenshots = screenshots.filter(
      s => s.mtime > conversationStartTime
    );

    if (recentScreenshots.length === 0) {
      console.log('No new screenshots found since conversation start');
      return;
    }

    // Sort by modification time (oldest first)
    recentScreenshots.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    console.log(`Found ${recentScreenshots.length} new screenshot(s) to send`);

    // Send each screenshot to Telegram
    for (const screenshot of recentScreenshots) {
      try {
        await ctx.replyWithPhoto(
          { source: screenshot.path },
          { caption: screenshot.name }
        );
        console.log(`Sent screenshot: ${screenshot.name}`);
      } catch (error) {
        console.error(`Error sending screenshot ${screenshot.name}:`, error);
        // Continue with other screenshots even if one fails
      }
    }
  } catch (error) {
    console.error('Error processing screenshots:', error);
    // Don't throw - screenshot sending is optional functionality
  }
}

/**
 * Ensure screenshot directory exists
 *
 * @param cwd - Current working directory
 */
export function ensureScreenshotDir(cwd: string): void {
  const screenshotDir = path.join(cwd, '.codex-screenshots');

  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    console.log(`Created screenshot directory: ${screenshotDir}`);
  }
}
