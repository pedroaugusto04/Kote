import { extractPageMetadata, convertHtmlToMarkdown, formatNoteWithFrontmatter } from './parser.js';

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
    const payload = extractPageMetadata(document, url, selectedHtml || null);
    
    // Convert HTML to Markdown in the content script where DOM is available
    const htmlToConvert = payload.selectedHtml || payload.contentHtml || '';
    const markdown = convertHtmlToMarkdown(htmlToConvert);
    
    return {
      success: true,
      isSelection: !!selectedHtml,
      result: payload,
      markdown: markdown,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to extract page content',
    };
  }
})();
