import { convertHtmlToMarkdown, formatNoteWithFrontmatter, type ClipPayload } from './parser.js';

async function refreshAccessToken(apiUrl: string): Promise<string> {
  const config = await chrome.storage.local.get(['refreshToken', 'authMethod']);
  
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (chrome.runtime.id) {
    headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
  }

  const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refreshToken: config.refreshToken }),
  });

  if (!refreshRes.ok) {
    // Refresh token is invalid or expired, need to re-authenticate
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'connectionToken', 'authMethod']);
    throw new Error('Session expired. Please log in again.');
  }

  const data = await refreshRes.json();
  await chrome.storage.local.set({ 
    accessToken: data.accessToken, 
    refreshToken: data.refreshToken 
  });
  
  return data.accessToken;
}

async function fetchWithAuth(url: string, options: RequestInit = {}, apiUrl: string): Promise<Response> {
  const config = await chrome.storage.local.get(['accessToken', 'authMethod']);
  const headers: Record<string, string> = { 
    ...options.headers as Record<string, string>,
    'Content-Type': 'application/json',
  };
  
  if (config.accessToken) {
    headers['Authorization'] = `Bearer ${config.accessToken}`;
  }
  
  if (chrome.runtime.id) {
    headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
  }

  let response = await fetch(url, { ...options, headers });

  // If we get a 401, try to refresh the token and retry
  if (response.status === 401 && config.authMethod === 'email') {
    try {
      const newAccessToken = await refreshAccessToken(apiUrl);
      headers['Authorization'] = `Bearer ${newAccessToken}`;
      response = await fetch(url, { ...options, headers });
    } catch (error) {
      // Clear auth data and throw error
      await chrome.storage.local.remove(['accessToken', 'refreshToken', 'connectionToken', 'authMethod']);
      throw error;
    }
  }

  return response;
}

// Setup right-click context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'kb-save-selection',
    title: 'Save selection to Kote',
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

      // Show immediate visual feedback on the page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const indicator = document.createElement('div');
          indicator.id = 'kote-clip-indicator';
          indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #53c7de 0%, #0369a1 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: koteSlideIn 0.3s ease-out;
          `;
          indicator.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: koteSpin 1s linear infinite">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Capturing page to Kote...</span>
          `;
          
          const style = document.createElement('style');
          style.textContent = `
            @keyframes koteSlideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes koteSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `;
          document.head.appendChild(style);
          document.body.appendChild(indicator);
        },
      });

      // Extract content-extractor results
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extractor.js'],
      });
      const result = (results?.[0] as any)?.result;

      if (result && result.success && result.result) {
        await saveClippedNote(result.result, ['quick-clip']);

        // Update indicator to show success
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const indicator = document.getElementById('kote-clip-indicator');
            if (indicator) {
              indicator.style.background = 'linear-gradient(135deg, #7dd3a5 0%, #15803d 100%)';
              indicator.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Saved successfully to Kote!</span>
              `;
              setTimeout(() => {
                indicator.style.animation = 'koteSlideOut 0.3s ease-in forwards';
                setTimeout(() => indicator.remove(), 300);
              }, 2000);
            }

            const style = document.createElement('style');
            style.textContent = `
              @keyframes koteSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
              }
            `;
            document.head.appendChild(style);
          },
        });
      } else {
        // Update indicator to show error
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const indicator = document.getElementById('kote-clip-indicator');
            if (indicator) {
              indicator.style.background = 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)';
              indicator.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>Failed to extract page content</span>
              `;
              setTimeout(() => {
                indicator.style.animation = 'koteSlideOut 0.3s ease-in forwards';
                setTimeout(() => indicator.remove(), 300);
              }, 3000);
            }

            const style = document.createElement('style');
            style.textContent = `
              @keyframes koteSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
              }
            `;
            document.head.appendChild(style);
          },
        });
        showNotification('Error', result?.error || 'Failed to extract page content.');
      }
    } catch (err: any) {
      // Update indicator to show error
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (errorMessage: string) => {
            const indicator = document.getElementById('kote-clip-indicator');
            if (indicator) {
              indicator.style.background = 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)';
              indicator.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>${errorMessage || 'Failed to save to Kote'}</span>
              `;
              setTimeout(() => {
                indicator.style.animation = 'koteSlideOut 0.3s ease-in forwards';
                setTimeout(() => indicator.remove(), 300);
              }, 4000);
            }

            const style = document.createElement('style');
            style.textContent = `
              @keyframes koteSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
              }
            `;
            document.head.appendChild(style);
          },
          args: [err.message || 'Failed to save to Kote'],
        }).catch(() => {});
      }
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
  let { apiUrl, connectionToken, defaultProject, authMethod, accessToken: storedAccessToken } = await chrome.storage.local.get([
    'apiUrl',
    'connectionToken',
    'defaultProject',
    'authMethod',
    'accessToken',
  ]);

  const resolvedApiUrl = apiUrl || 'https://knowledgebase.sbs/kote';

  // Check if any auth method is configured
  if (!connectionToken && !authMethod) {
    throw new Error('Connection Token not configured. Please open extension settings.');
  }

  const project = projectSlugOverride || defaultProject || 'inbox';
  let cleanApiUrl = resolvedApiUrl.trim().replace(/\/$/, '');
  if (cleanApiUrl.endsWith('/api')) {
    cleanApiUrl = cleanApiUrl.slice(0, -4);
  }

  // Convert HTML to Markdown (if not already converted in content script)
  let markdown = (clip as any).markdown;
  if (!markdown) {
    const htmlToConvert = clip.selectedHtml || clip.contentHtml || '';
    markdown = convertHtmlToMarkdown(htmlToConvert);
  }

  // Prepend frontmatter markdown content
  const formattedBody = formatNoteWithFrontmatter(clip, markdown, tags);

  // Handle authentication based on method
  let accessToken: string;
  let refreshToken: string | undefined = undefined;

  if (authMethod === 'email' && storedAccessToken) {
    // Email/password auth: use stored access token
    accessToken = storedAccessToken;
  } else if (connectionToken) {
    // Token auth: exchange connection token
    accessToken = connectionToken.trim();

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
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (chrome.runtime.id) {
          headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
        }
        
        const exchangeRes = await fetch(`${cleanApiUrl}/api/auth/exchange-connection-token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ connectionToken }),
        });
        if (!exchangeRes.ok) {
          // Clear expired tokens and prompt user to re-authenticate
          await chrome.storage.local.remove(['accessToken', 'refreshToken', 'connectionToken', 'authMethod']);
          throw new Error('Session expired. Please open extension settings to log in again.');
        }
        const data = await exchangeRes.json();
        accessToken = data.accessToken;
        refreshToken = data.refreshToken;
        // Cache the exchanged tokens for subsequent calls
        await chrome.storage.local.set({ accessToken, refreshToken });
      }
    }
  } else {
    throw new Error('No valid authentication found. Please open extension settings.');
  }

  // POST note request
  let response;
  try {
    response = await fetchWithAuth(`${cleanApiUrl}/api/notes`, {
      method: 'POST',
      body: JSON.stringify({
        projectSlug: project,
        title: clip.title,
        rawText: formattedBody,
        source: 'web-clipper',
        tags: tags,
      }),
    }, cleanApiUrl);
  } catch (error: any) {
    // Check if this is an auth/session error
    if (error.message && (error.message.includes('Session expired') || error.message.includes('No refresh token'))) {
      showNotification('Authentication Error', 'Your session has expired. Please open extension settings to log in again.');
      throw new Error('Session expired. Please re-authenticate in extension settings.');
    }
    throw error;
  }

  if (!response.ok) {
    let errorMsg = 'Failed to create note';
    try {
      const errData = await response.json();
      errorMsg = errData.message || errorMsg;
    } catch { }
    
    // Check for auth errors in response
    if (response.status === 401) {
      showNotification('Authentication Error', 'Your session has expired. Please open extension settings to log in again.');
      throw new Error('Session expired. Please re-authenticate in extension settings.');
    }
    
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
