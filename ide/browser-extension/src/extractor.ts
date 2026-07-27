import { Readability } from '@mozilla/readability';

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

// Run Readability to extract clean article HTML and metadata.
// NOTE: This module intentionally does NOT import Turndown.
// Turndown's shouldUseActiveX() probe calls
// document.implementation.createHTMLDocument("").open(), which throws on many
// pages when this code runs as an injected content script.
// Markdown conversion is handled separately in background.ts.
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

  // If there's an active selection, skip full page Readability extraction
  if (selectedHtml) {
    const pageTitle = doc.title || 'Selected Snippet';
    return {
      url,
      title: `${pageTitle} - ${url}`,
      author: author ? author.trim() : null,
      site: site ? site.trim() : null,
      publishedAt: publishedAt ? publishedAt.trim() : null,
      selectedHtml,
    };
  }

  // Clone document to avoid modifying active page DOM during Readability parse
  const docClone = doc.implementation.createHTMLDocument(doc.title);
  docClone.documentElement.innerHTML = doc.documentElement.innerHTML;
  const reader = new Readability(docClone, {
    charThreshold: 0,
    keepClasses: false,
  });

  const article = reader.parse();
  if (!article) {
    throw new Error('Failed to parse article content from this page.');
  }

  const pageTitle = article.title || doc.title || 'Untitled Page';
  return {
    url,
    title: `${pageTitle} - ${url}`,
    excerpt: article.excerpt,
    author: (article.byline || author || '').trim() || null,
    site: (article.siteName || site || '').trim() || null,
    publishedAt: publishedAt ? publishedAt.trim() : null,
    contentHtml: article.content, // Return clean article HTML only
  };
}
