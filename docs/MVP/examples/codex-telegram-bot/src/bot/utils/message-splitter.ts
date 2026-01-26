/**
 * Message Splitter
 *
 * Splits long messages to respect Telegram's 4096 character limit
 * Reference: telegram_bot.py lines 677-718
 */

import { Context } from 'telegraf';

const TELEGRAM_MAX_LENGTH = 4096;
const SPLIT_MARKER = '\n\n---\n\n';

/**
 * Send a long message to Telegram, splitting if necessary
 *
 * @param ctx - Telegram context
 * @param text - Message text (can be longer than 4096 chars)
 */
export async function sendLongMessage(ctx: Context, text: string): Promise<void> {
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    // Message fits in one chunk
    await ctx.reply(text);
    return;
  }

  // Split message into chunks
  const chunks = splitMessage(text, TELEGRAM_MAX_LENGTH);

  console.log(`Splitting long message into ${chunks.length} parts`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prefix = chunks.length > 1 ? `📄 Part ${i + 1}/${chunks.length}\n\n` : '';
    await ctx.reply(prefix + chunk);

    // Small delay between messages to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Split text into chunks respecting maxLength
 *
 * Tries to split at natural boundaries (paragraphs, sentences)
 *
 * @param text - Text to split
 * @param maxLength - Maximum length per chunk
 * @returns Array of text chunks
 */
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good split point
    let splitIndex = maxLength;

    // Try to split at paragraph boundary (\n\n)
    const paragraphIndex = remaining.lastIndexOf('\n\n', maxLength);
    if (paragraphIndex > maxLength / 2) {
      splitIndex = paragraphIndex + 2; // Include the newlines
    } else {
      // Try to split at sentence boundary (. or ! or ?)
      const sentenceMatch = remaining.substring(0, maxLength).match(/[.!?]\s/g);
      if (sentenceMatch) {
        const lastSentence = remaining.lastIndexOf(sentenceMatch[sentenceMatch.length - 1], maxLength);
        if (lastSentence > maxLength / 2) {
          splitIndex = lastSentence + 2; // Include period and space
        }
      } else {
        // Try to split at word boundary
        const spaceIndex = remaining.lastIndexOf(' ', maxLength);
        if (spaceIndex > maxLength / 2) {
          splitIndex = spaceIndex + 1; // Include the space
        }
      }
    }

    // Extract chunk and update remaining
    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}
