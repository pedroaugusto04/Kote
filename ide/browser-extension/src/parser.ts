import TurndownService from 'turndown';

// Re-export ClipPayload and extractPageMetadata from the Turndown-free extractor
// module so that content-extractor.ts can import from extractor.ts directly
// without bundling Turndown (and its broken shouldUseActiveX probe) into the
// injected content script.
export type { ClipPayload } from './extractor.js';
export { extractPageMetadata } from './extractor.js';

// Helper to initialize Turndown with options
export function getTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Keep code blocks clean
  turndownService.addRule('pre-code', {
    filter: (node) => {
      return node.nodeName === 'PRE' && node.firstElementChild?.nodeName === 'CODE';
    },
    replacement: (content, node) => {
      const codeElem = node.firstElementChild as HTMLElement | null;
      if (!codeElem) return `\n\n\`\`\`\n${content?.trim() ?? ''}\n\`\`\`\n\n`;
      const className = codeElem.className || '';
      const match = className.match(/language-(\w+)/);
      const lang = match ? match[1] : '';
      return `\n\n\`\`\`${lang}\n${codeElem.textContent?.trim()}\n\`\`\`\n\n`;
    },
  });

  // Strip scripts, styles, and other non-content elements
  turndownService.addRule('strip-tags', {
    filter: (node) => ['script', 'style', 'noscript', 'iframe', 'svg'].includes(node.nodeName.toLowerCase()),
    replacement: () => '',
  });

  return turndownService;
}

// Convert HTML to Markdown (used in Background SW)
export function convertHtmlToMarkdown(html: string): string {
  const turndown = getTurndownService();
  return turndown.turndown(html);
}

// Format note content with Frontmatter metadata (used in Background SW)
export function formatNoteWithFrontmatter(payload: import('./extractor.js').ClipPayload, markdown: string, tags: string[] = []): string {
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
