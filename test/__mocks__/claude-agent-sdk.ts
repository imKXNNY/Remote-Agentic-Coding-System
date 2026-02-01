/**
 * Minimal stub for the @anthropic-ai/claude-agent-sdk used in tests.
 * Provides a query() helper that returns an async generator.
 */
export function query(): AsyncGenerator<{ type: string; content?: string }> {
  async function* generator() {
    // Emit a single empty assistant chunk to satisfy consumers.
    yield { type: 'assistant', content: '' };
  }

  return generator();
}
