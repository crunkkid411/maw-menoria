/**
 * HTML to Markdown conversion using node-html-markdown
 * 1.57x faster than Turndown
 */

import { NodeHtmlMarkdown } from 'node-html-markdown';

// Configure node-html-markdown for optimal output
const nhm = new NodeHtmlMarkdown({
  codeFence: '```',
  bulletMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  maxConsecutiveNewlines: 2,
  useLinkReferenceDefinitions: false,
  useInlineLinks: true,
});

/**
 * Convert HTML to Markdown
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) {
    return '';
  }

  try {
    const markdown = nhm.translate(html);
    return postProcess(markdown);
  } catch (error) {
    // Fallback: strip HTML tags if conversion fails
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Post-process markdown for cleaner output
 */
function postProcess(markdown: string): string {
  return markdown
    // Normalize line endings
    .replace(/\r\n/g, '\n')

    // Max 2 consecutive newlines
    .replace(/\n{3,}/g, '\n\n')

    // Trim trailing whitespace on each line
    .replace(/[ \t]+$/gm, '')

    // Fix code block spacing
    .replace(/```(\w*)\n\n+/g, '```$1\n')
    .replace(/\n\n+```/g, '\n```')

    // Remove empty code blocks
    .replace(/```\w*\n\s*\n?```/g, '')

    // Collapse multiple spaces (but not in code blocks)
    .replace(/(?<!```)[ ]{2,}(?!```)/g, ' ')

    // Remove leading/trailing empty lines in blockquotes
    .replace(/^>\s*\n/gm, '> ')
    .replace(/\n>\s*$/gm, '')

    // Fix list formatting
    .replace(/^(-|\*|\d+\.)\s+\n/gm, '')

    // Remove excessive horizontal rules
    .replace(/(---\n){2,}/g, '---\n')

    // Clean up link formatting
    .replace(/\[([^\]]*)\]\(\s+/g, '[$1](')
    .replace(/\s+\)/g, ')')

    // Final trim
    .trim() + '\n';
}

/**
 * Extract plain text from markdown (remove formatting)
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')

    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')

    // Convert links to text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')

    // Remove emphasis
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')

    // Remove blockquotes
    .replace(/^>\s*/gm, '')

    // Remove horizontal rules
    .replace(/^---$/gm, '')

    // Remove list markers
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')

    // Collapse whitespace
    .replace(/\s+/g, ' ')

    .trim();
}
