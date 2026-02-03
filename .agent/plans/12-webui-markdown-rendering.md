# Plan: Issue #12 - Render assistant Markdown in WebUI chat

## Execution Contract
- Issue: #12
- Branch: `feature/12-webui-markdown-chat`
- Plan file: `.agent/plans/12-webui-markdown-rendering.md`

## Goal
Render assistant responses as Markdown in the WebUI chat while keeping user messages as plain text.

## Acceptance Criteria
- [ ] Assistant messages render markdown consistently.
- [ ] Code blocks are syntax-highlighted or visually distinct.
- [ ] Links are styled and open in a new tab.
- [ ] Performance remains acceptable for long messages.

## Touch Points
- `webui/src/components/Chat.svelte`
- `webui/src/lib/` (new markdown utility module)
- `README.md` (if behavior note is needed)

## Implementation Slices
1. **Markdown utility layer**
   - Add a small utility to parse Markdown with `marked`.
   - Ensure links render with `target="_blank"` + `rel="noopener noreferrer"`.
   - Escape raw HTML input before parsing to avoid unsafe HTML injection.
   - Add formatting helpers for plain-text fallback.

2. **Chat rendering integration**
   - Render assistant role messages with parsed HTML (`{@html ...}` from utility).
   - Keep user role messages plain text.
   - Keep existing timestamps/layout unchanged.

3. **Styling for readability**
   - Add styles for headings, paragraphs, lists, blockquotes, inline code, fenced code, links, and tables in chat bubbles.
   - Ensure code blocks are visually distinct and scrollable.

4. **Validation**
   - `npm run type-check`
   - `npm --prefix webui run check`
   - `npm test`
   - `npm run lint`
   - `npm run build`

## Risks / Edge Cases
- Very long messages can increase render cost; avoid extra parsing passes and parse once per message render.
- `{@html}` safety: enforce escaping before markdown parse to keep rendering predictable.

## Rollback
- Revert markdown utility + Chat rendering block to restore plain text rendering immediately.
