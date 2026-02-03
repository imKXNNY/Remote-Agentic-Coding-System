import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withSafeLinkAttributes(html: string): string {
  return html.replace(/<a\s+([^>]*href="[^"]+"[^>]*)>/g, (_match, attrs: string) => {
    let next = attrs;
    if (!/\btarget=/.test(next)) {
      next += ' target="_blank"';
    }
    if (!/\brel=/.test(next)) {
      next += ' rel="noopener noreferrer"';
    }
    return `<a ${next}>`;
  });
}

export function renderAssistantMarkdown(content: string): string {
  const escaped = escapeHtml(content);
  const parsed = marked.parse(escaped, { async: false });
  return withSafeLinkAttributes(parsed);
}
