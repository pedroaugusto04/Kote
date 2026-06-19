import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ClipPayload {
  url: string;
  title: string;
  excerpt?: string | null;
  author?: string | null;
  site?: string | null;
  publishedAt?: string | null;
  contentHtml?: string | null;
  selectedHtml?: string | null;
}

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
      const codeElem = node.firstElementChild as HTMLElement;
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

// Run Readability to extract clean article HTML and metadata
export function extractPageMetadata(doc: Document, url: string, selectedHtml?: string | null): ClipPayload {
  // Extract author from document metadata tags
  let author = null;
  const authorMeta = doc.querySelector('meta[name="author"]') || doc.querySelector('meta[property="article:author"]');
  if (authorMeta) {
    author = authorMeta.getAttribute('content');
  }

  // Extract site name from document metadata tags
  let site = null;
  const siteMeta = doc.querySelector('meta[property="og:site_name"]');
  if (siteMeta) {
    site = siteMeta.getAttribute('content');
  } else {
    try {
      site = new URL(url).hostname;
    } catch {}
  }

  // Extract published time from document metadata tags
  let publishedAt = null;
  const pubDateMeta = doc.querySelector('meta[property="article:published_time"]') || 
                      doc.querySelector('meta[name="publish-date"]') || 
                      doc.querySelector('meta[name="pubdate"]') ||
                      doc.querySelector('meta[property="og:pubdate"]');
  if (pubDateMeta) {
    publishedAt = pubDateMeta.getAttribute('content');
  }

  // If there's an active selection, we skip full page Readability extraction
  if (selectedHtml) {
    return {
      url,
      title: doc.title || 'Selected Snippet',
      author: author ? author.trim() : null,
      site: site ? site.trim() : null,
      publishedAt: publishedAt ? publishedAt.trim() : null,
      selectedHtml,
    };
  }

  // Clone document to avoid modifying active page DOM during Readability parse
  const docClone = doc.cloneNode(true) as Document;
  const reader = new Readability(docClone, {
    charThreshold: 0,
    keepClasses: false,
  });

  const article = reader.parse();
  if (!article) {
    throw new Error('Failed to parse article content from this page.');
  }

  return {
    url,
    title: article.title || doc.title || 'Untitled Page',
    excerpt: article.excerpt,
    author: (article.byline || author || '').trim() || null,
    site: (article.siteName || site || '').trim() || null,
    publishedAt: publishedAt ? publishedAt.trim() : null,
    contentHtml: article.content, // Return clean article HTML only
  };
}

// Convert HTML to Markdown (used in Background SW)
export function convertHtmlToMarkdown(html: string): string {
  const turndown = getTurndownService();
  return turndown.turndown(html);
}

// Format note content with Frontmatter metadata (used in Background SW)
export function formatNoteWithFrontmatter(payload: ClipPayload, markdown: string, tags: string[] = []): string {
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
