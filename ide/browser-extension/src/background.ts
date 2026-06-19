import { DOMParser, DOMImplementation } from '@xmldom/xmldom';

if (typeof globalThis.DOMParser === 'undefined' || (globalThis.DOMParser as any).__isShim !== true) {
  const OriginalDOMParser = DOMParser;
  class ShimmedDOMParser extends OriginalDOMParser {
    static __isShim = true;
    parseFromString(source: string, mimeType: string) {
      if (!source || source.trim() === '') {
        return super.parseFromString('<html />', 'text/xml');
      }
      const targetMime = mimeType === 'text/html' ? 'text/xml' : mimeType;
      return super.parseFromString(source, targetMime);
    }
  }
  globalThis.DOMParser = ShimmedDOMParser as any;
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null) as any;
}

import { convertHtmlToMarkdown, formatNoteWithFrontmatter, type ClipPayload } from './parser.js';

// Setup right-click context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'kb-save-selection',
    title: 'Save selection to Knowledge Base',
    contexts: ['selection'],
  });
});

// Listen for context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'kb-save-selection' && tab?.id) {
    try {
      // Inject and execute content-extractor to get formatted selection
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extractor.js'],
      });
      const result = (results?.[0] as any)?.result;

      if (result && result.success && result.result) {
        await saveClippedNote(result.result, ['context-menu']);
      } else {
        showNotification('Error', result?.error || 'Failed to extract selection content.');
      }
    } catch (err: any) {
      showNotification('Error', err.message || 'Failed to clip selection.');
    }
  }
});

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-clip-page') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) {
        showNotification('Error', 'Browser settings pages cannot be clipped.');
        return;
      }

      // Extract content-extractor results
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extractor.js'],
      });
      const result = (results?.[0] as any)?.result;

      if (result && result.success && result.result) {
        await saveClippedNote(result.result, ['quick-clip']);
      } else {
        showNotification('Error', result?.error || 'Failed to extract page content.');
      }
    } catch (err: any) {
      showNotification('Error', err.message || 'Failed to quick clip page.');
    }
  }
});

// Listen for messages from popup or other scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_CLIP') {
    saveClippedNote(message.clip, message.tags, message.projectSlug)
      .then((res) => sendResponse({ success: true, noteId: res.noteId || res.id }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
  return false;
});

// Helper function to save note via backend API
async function saveClippedNote(clip: ClipPayload, tags: string[] = [], projectSlugOverride?: string): Promise<any> {
  let { apiUrl, connectionToken, defaultProject } = await chrome.storage.local.get([
    'apiUrl',
    'connectionToken',
    'defaultProject',
  ]);

  const resolvedApiUrl = apiUrl || 'https://pedro-duarte.ddns.net/knowledge-base';

  if (!connectionToken) {
    throw new Error('Connection Token not configured. Please open extension settings.');
  }

  const project = projectSlugOverride || defaultProject || 'inbox';
  let cleanApiUrl = resolvedApiUrl.trim().replace(/\/$/, '');
  if (cleanApiUrl.endsWith('/api')) {
    cleanApiUrl = cleanApiUrl.slice(0, -4);
  }

  // Convert HTML to Markdown in the Background service worker
  const htmlToConvert = clip.selectedHtml || clip.contentHtml || '';
  const markdown = convertHtmlToMarkdown(htmlToConvert);

  // Prepend frontmatter markdown content
  const formattedBody = formatNoteWithFrontmatter(clip, markdown, tags);

  // Exchange connection token to get cookies or credentials
  let accessToken = connectionToken.trim();
  let refreshToken: string | undefined = undefined;

  if (accessToken.startsWith('kbc_')) {
    try {
      const payload = Uint8Array.from(atob(accessToken.slice(4)), (c) => c.charCodeAt(0));
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      if (parsed.accessToken) {
        accessToken = parsed.accessToken;
        refreshToken = parsed.refreshToken;
      }
    } catch {
      // Exchange connection token via HTTP API
      const exchangeRes = await fetch(`${cleanApiUrl}/api/auth/exchange-connection-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionToken }),
      });
      if (!exchangeRes.ok) {
        throw new Error('Failed to exchange connection token with server.');
      }
      const data = await exchangeRes.json();
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
      // Cache the exchanged tokens for subsequent calls
      await chrome.storage.local.set({ accessToken, refreshToken });
    }
  }

  // POST note request
  const response = await fetch(`${cleanApiUrl}/api/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      projectSlug: project,
      title: clip.title,
      rawText: formattedBody,
      source: 'web-clipper',
      tags: tags,
    }),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to create note';
    try {
      const errData = await response.json();
      errorMsg = errData.message || errorMsg;
    } catch { }
    throw new Error(errorMsg);
  }

  const result = await response.json();
  showNotification('Success', `Saved "${clip.title}" to project: ${project}`);
  return result;
}

// Show chrome notification
function showNotification(title: string, message: string) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message,
    priority: 1,
  }, () => {
    // Clear runtime error if icon.png doesn't exist
    if (chrome.runtime.lastError) {
      // ignore
    }
  });
}
