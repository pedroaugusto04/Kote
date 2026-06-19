import { extractPageMetadata } from './parser.js';

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
