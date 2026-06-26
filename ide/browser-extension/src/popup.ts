import type { ClipPayload } from './parser.js';

interface ProjectInfo {
  projectSlug: string;
  displayName: string;
}

// Global state
let currentClip: ClipPayload | null = null;
let currentAuthMethod: 'token' | 'email' = 'token';

async function getOrExchangeAccessToken(currentApiUrl: string, connectionToken: string): Promise<string> {
  const cached = await chrome.storage.local.get(['accessToken']);
  if (cached.accessToken) {
    return cached.accessToken;
  }

  if (connectionToken.startsWith('kbc_')) {
    try {
      const payload = Uint8Array.from(atob(connectionToken.slice(4)), (c) => c.charCodeAt(0));
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      if (parsed.accessToken) {
        await chrome.storage.local.set({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken });
        return parsed.accessToken;
      }
    } catch {
      // ignore and proceed to exchange
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (chrome.runtime.id) {
    headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
  }
  
  const exchangeRes = await fetch(`${currentApiUrl}/api/auth/exchange-connection-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionToken }),
  });
  if (!exchangeRes.ok) {
    throw new Error('Failed to exchange connection token.');
  }
  const data = await exchangeRes.json();
  await chrome.storage.local.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.accessToken;
}

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const panelSettings = document.getElementById('panel-settings')!;
  const panelClipper = document.getElementById('panel-clipper')!;
  const btnSettingsToggle = document.getElementById('btn-settings-toggle')!;

  const inputApiUrl = document.getElementById('input-api-url') as HTMLInputElement;
  const inputToken = document.getElementById('input-token') as HTMLInputElement;
  const inputEmail = document.getElementById('input-email') as HTMLInputElement;
  const inputPassword = document.getElementById('input-password') as HTMLInputElement;
  const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement;

  const tabToken = document.getElementById('tab-token') as HTMLButtonElement;
  const tabEmail = document.getElementById('tab-email') as HTMLButtonElement;
  const authFormToken = document.getElementById('auth-form-token')!;
  const authFormEmail = document.getElementById('auth-form-email')!;

  const badgeClipType = document.getElementById('badge-clip-type')!;
  const textSourceUrl = document.getElementById('text-source-url')!;
  const inputTitle = document.getElementById('input-title') as HTMLInputElement;
  const selectProject = document.getElementById('select-project') as HTMLSelectElement;
  const inputTags = document.getElementById('input-tags') as HTMLInputElement;
  const btnClip = document.getElementById('btn-clip') as HTMLButtonElement;
  const btnClipText = document.getElementById('btn-clip-text')!;
  const btnClipSpinner = document.getElementById('btn-clip-spinner')!;

  const statusBanner = document.getElementById('status-banner')!;

  // Load stored configuration
  const config = await chrome.storage.local.get(['apiUrl', 'connectionToken', 'defaultProject', 'authMethod']);
  const defaultApiUrl = 'https://knowledgebase.sbs/kote';
  let apiUrl = config.apiUrl || defaultApiUrl;

  apiUrl = apiUrl.trim().replace(/\/$/, '');
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }

  inputApiUrl.value = apiUrl;

  // Set auth method based on stored config or default to token
  currentAuthMethod = config.authMethod || 'token';
  updateAuthTabUI();

  if (config.connectionToken || config.authMethod === 'email') {
    // Already configured, show clipper
    panelSettings.classList.add('hidden');
    panelClipper.classList.remove('hidden');
    if (config.connectionToken) {
      inputToken.value = config.connectionToken;
    }
    await initializeClipper();
  } else {
    // Not configured, force settings view (but API URL is already prefilled)
    panelSettings.classList.remove('hidden');
    panelClipper.classList.add('hidden');
  }

  // Auth Tab Switching
  tabToken.addEventListener('click', () => {
    currentAuthMethod = 'token';
    updateAuthTabUI();
  });

  tabEmail.addEventListener('click', () => {
    currentAuthMethod = 'email';
    updateAuthTabUI();
  });

  function updateAuthTabUI() {
    if (currentAuthMethod === 'token') {
      tabToken.classList.add('active');
      tabEmail.classList.remove('active');
      authFormToken.classList.remove('hidden');
      authFormEmail.classList.add('hidden');
    } else {
      tabToken.classList.remove('active');
      tabEmail.classList.add('active');
      authFormToken.classList.add('hidden');
      authFormEmail.classList.remove('hidden');
    }
  }

  // Settings Toggle Click
  btnSettingsToggle.addEventListener('click', () => {
    panelSettings.classList.toggle('hidden');
    panelClipper.classList.toggle('hidden');
  });

  // Save Settings Click
  btnSaveSettings.addEventListener('click', async () => {
    let url = inputApiUrl.value.trim().replace(/\/$/, '');

    if (!url) {
      showStatus('Enter API URL.', 'error');
      return;
    }

    if (url.endsWith('/api')) {
      url = url.slice(0, -4);
    }

    btnSaveSettings.disabled = true;
    showStatus('Validating connection...', 'success');

    try {
      let accessToken: string;

      if (currentAuthMethod === 'token') {
        const token = inputToken.value.trim();
        if (!token) {
          showStatus('Enter Connection Token.', 'error');
          btnSaveSettings.disabled = false;
          return;
        }

        // Exchange and validate connection token
        accessToken = await getOrExchangeAccessToken(url, token);

        // Save credentials
        await chrome.storage.local.set({
          apiUrl: url,
          connectionToken: token,
          authMethod: 'token',
        });
      } else {
        const email = inputEmail.value.trim();
        const password = inputPassword.value.trim();

        if (!email || !password) {
          showStatus('Enter email and password.', 'error');
          btnSaveSettings.disabled = false;
          return;
        }

        // Login with email/password
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (chrome.runtime.id) {
          headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
        }

        const loginRes = await fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, password }),
        });

        if (!loginRes.ok) {
          const errorData = await loginRes.json().catch(() => ({}));
          throw new Error(errorData.message || 'Login failed. Check your credentials.');
        }

        const loginData = await loginRes.json();
        
        // Backend returns tokens in response body for browser extensions
        if (!loginData.accessToken || !loginData.refreshToken) {
          throw new Error('Failed to extract authentication tokens.');
        }
        
        accessToken = loginData.accessToken;
        await chrome.storage.local.set({
          accessToken: loginData.accessToken,
          refreshToken: loginData.refreshToken,
        });

        // Save credentials
        await chrome.storage.local.set({
          apiUrl: url,
          authMethod: 'email',
        });
      }

      // Check workspaces to verify full token validity
      const testRes = await fetch(`${url}/api/workspaces`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!testRes.ok) {
        throw new Error('Authentication rejected by backend.');
      }

      showStatus('Connection successful!', 'success');

      // Load Clipper view
      setTimeout(async () => {
        panelSettings.classList.add('hidden');
        panelClipper.classList.remove('hidden');
        await initializeClipper();
      }, 1000);

    } catch (err: any) {
      showStatus(`Connection failed: ${err.message || 'Check credentials.'}`, 'error');
    } finally {
      btnSaveSettings.disabled = false;
    }
  });

  let noteUrl: string | null = null;

  // Save Note Click
  btnClip.addEventListener('click', async () => {
    if (noteUrl) {
      chrome.tabs.create({ url: noteUrl });
      window.close();
      return;
    }

    const clip = currentClip;
    if (!clip) {
      showStatus('No content to clip.', 'error');
      return;
    }

    const title = inputTitle.value.trim();
    if (!title) {
      showStatus('Please enter a note title.', 'error');
      return;
    }

    const projectSlug = selectProject.value;
    const rawTags = inputTags.value.trim();
    const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];

    // Update current clip options
    clip.title = title;

    // Show loading state
    btnClip.disabled = true;
    btnClipText.textContent = 'Saving Note...';
    btnClipSpinner.classList.remove('hidden');
    hideStatus();

    // Send save message to background service worker
    chrome.runtime.sendMessage({
      type: 'SAVE_CLIP',
      clip: clip,
      tags,
      projectSlug,
    }, (response) => {
      btnClip.disabled = false;
      btnClipSpinner.classList.add('hidden');

      if (response && response.success) {
        showStatus('Note saved successfully!', 'success');
        noteUrl = `${apiUrl}/vault/${response.noteId}`;
        btnClipText.textContent = 'Open Note';
        btnClip.className = 'btn btn-full btn-success';
      } else {
        btnClipText.textContent = 'Save Note';
        showStatus(response?.error || 'Failed to save note.', 'error');
      }
    });
  });

  // Helper to retrieve tab contents and fetch projects list
  async function initializeClipper() {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus('Cannot clip this tab context.', 'error');
        return;
      }

      // Check url protocol (chrome:// URLs cannot be clipped)
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) {
        showStatus('Browser settings pages cannot be clipped.', 'error');
        return;
      }

      showStatus('Scanning page...', 'success');

      // Inject and execute content-extractor in the tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extractor.js'],
      });
      const result = (results?.[0] as any)?.result;

      hideStatus();

      if (result && result.success && result.result) {
        currentClip = result.result;

        // Populate UI Fields
        inputTitle.value = result.result.title;
        textSourceUrl.textContent = result.result.url;
        badgeClipType.textContent = result.isSelection ? 'Selection Clip' : 'Full Page Clip';
      } else {
        throw new Error(result?.error || 'Failed to parse page content.');
      }

      // Load projects dropdown
      await loadProjects();

    } catch (err: any) {
      showStatus(`Page scan failed: ${err.message}`, 'error');
    }
  }

  // Load Projects list from backend
  async function loadProjects() {
    const config = await chrome.storage.local.get(['apiUrl', 'connectionToken', 'authMethod', 'accessToken']);
    let currentApiUrl = config.apiUrl || 'https://knowledgebase.sbs/kote';
    currentApiUrl = currentApiUrl.trim().replace(/\/$/, '');
    if (currentApiUrl.endsWith('/api')) {
      currentApiUrl = currentApiUrl.slice(0, -4);
    }
    
    // Check if we have any auth method configured
    if (!config.connectionToken && !config.authMethod) return;

    try {
      let accessToken: string;
      
      if (config.authMethod === 'email' && config.accessToken) {
        accessToken = config.accessToken;
      } else if (config.connectionToken) {
        accessToken = await getOrExchangeAccessToken(currentApiUrl, config.connectionToken);
      } else {
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      };
      if (chrome.runtime.id) {
        headers['Origin'] = `chrome-extension://${chrome.runtime.id}`;
      }

      const res = await fetch(`${currentApiUrl}/api/projects?page=1&pageSize=100`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Projects API response:', data);
        const list: ProjectInfo[] = data.projects ?? data.items ?? [];
        console.log('Projects list:', list);

        // Clear default option
        selectProject.innerHTML = '';

        // Always add Inbox option first
        const inboxOpt = document.createElement('option');
        inboxOpt.value = 'inbox';
        inboxOpt.textContent = 'Inbox (Default)';
        selectProject.appendChild(inboxOpt);

        // Add projects from API
        for (const proj of list) {
          const opt = document.createElement('option');
          opt.value = proj.projectSlug;
          opt.textContent = proj.displayName || proj.projectSlug;
          selectProject.appendChild(opt);
        }
      } else {
        console.warn('Failed to load projects:', res.status, res.statusText);
        // Fallback to static Inbox project
        selectProject.innerHTML = '';
        const inboxOpt = document.createElement('option');
        inboxOpt.value = 'inbox';
        inboxOpt.textContent = 'Inbox (Default)';
        selectProject.appendChild(inboxOpt);
      }
    } catch (error) {
      // Fallback to static Inbox project
      console.warn('Failed to load dynamic project list:', error);
      selectProject.innerHTML = '';
      const inboxOpt = document.createElement('option');
      inboxOpt.value = 'inbox';
      inboxOpt.textContent = 'Inbox (Default)';
      selectProject.appendChild(inboxOpt);
    }
  }

  // Helper banners
  function showStatus(message: string, type: 'success' | 'error') {
    statusBanner.textContent = message;
    statusBanner.className = `status-banner ${type}`;
    statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    statusBanner.classList.add('hidden');
    statusBanner.textContent = '';
  }
});
