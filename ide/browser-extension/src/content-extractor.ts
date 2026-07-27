import { extractPageMetadata } from './extractor.js';

(() => {
  // Get selection HTML preserving formatting
  let selectedHtml = '';
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const container = document.createElement('div');
    for (let i = 0; i < selection.rangeCount; i++) {
      container.appendChild(selection.getRangeAt(i).cloneContents());
    }
    selectedHtml = container.innerHTML.trim();
  }

  const url = window.location.href;

  try {
    // Only extract metadata and raw HTML here.
    // Markdown conversion (Turndown) is intentionally NOT done in this injected
    // script because Turndown's shouldUseActiveX() probe calls
    // document.implementation.createHTMLDocument("").open(), which throws on
    // many pages (CSP-restricted docs, special document states, etc.).
    // The background service worker handles Markdown conversion safely.
    const payload = extractPageMetadata(document, url, selectedHtml || null);

    return {
      success: true,
      isSelection: !!selectedHtml,
      result: payload,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to extract page content',
    };
  }
})();
