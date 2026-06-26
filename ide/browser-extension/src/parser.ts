import { NodeHtmlMarkdown } from 'node-html-markdown';

// Re-export from the Turndown-free extractor module so that
// content-extractor.ts can import from extractor.ts directly.
export type { ClipPayload } from './extractor.js';
export { extractPageMetadata } from './extractor.js';

// Singleton instance with options matching the old Turndown configuration
const nhm = new NodeHtmlMarkdown(
  {
    emDelimiter: '*',
    strongDelimiter: '**',
    bulletMarker: '-',
    codeBlockStyle: 'fenced',
    codeFence: '```',
    ignore: ['script', 'style', 'noscript', 'iframe', 'svg'],
    preferNativeParser: false,
  },
  // Custom translator: <hr> → ---
  {
    hr: { content: '\n\n---\n\n', recurse: false },
  },
);

// Convert HTML to Markdown (used in Background SW)
export function convertHtmlToMarkdown(html: string): string {
  return nhm.translate(html);
}

// Format note content with Frontmatter metadata (used in Background SW)
export function formatNoteWithFrontmatter(
  payload: import('./extractor.js').ClipPayload,
  markdown: string,
  tags: string[] = [],
): string {
  const frontmatter = [
    '---',
    `title: "${payload.title.replace(/"/g, '\\"')}"`,
    `source: "${payload.url}"`,
  ];

  if (payload.author) {
    frontmatter.push(`author: "${payload.author.replace(/"/g, '\\"')}"`);
  }
  if (payload.site) {
    frontmatter.push(`site: "${payload.site.replace(/"/g, '\\"')}"`);
  }
  if (payload.publishedAt) {
    frontmatter.push(`publishedAt: "${payload.publishedAt.replace(/"/g, '\\"')}"`);
  }

  frontmatter.push(`clippedAt: "${new Date().toISOString()}"`);

  if (tags.length > 0) {
    frontmatter.push(`tags: [${tags.map((t) => `"${t}"`).join(', ')}]`);
  }

  frontmatter.push('---');
  frontmatter.push('');

  if (payload.excerpt) {
    frontmatter.push(`> ${payload.excerpt}`);
    frontmatter.push('');
  }

  frontmatter.push(markdown);

  return frontmatter.join('\n');
}
