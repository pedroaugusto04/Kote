import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession } from './types';
import type { KbClient } from '../kb-client';
import { logInfo, toMessage } from '../error-reporter';

type SessionPromptAction = 'Auto-save' | 'Preview & Edit' | 'Ignore';

const SESSION_PROMPT_TIMEOUT_MS = 2 * 60 * 1000;

export class AiHistoryManager {
  private providers = new Map<string, AiHistoryProvider>();
  private activeDisposables: vscode.Disposable[] = [];
  private knownSessionHashes = new Map<string, string>(); // track content hashes to detect real changes
  private recentSessions: AiSession[] = []; // store in memory to allow viewing/importing later
  private context?: vscode.ExtensionContext;
  private savedSessions = new Map<string, number>(); // key -> timestamp "providerId:sessionId"
  private ignoredSessions = new Map<string, number>(); // key -> timestamp "providerId:sessionId"
  private promptingSessions = new Set<string>(); // prevent overlapping popups for the same active session
  private pendingPromptSessions = new Map<string, AiSession>(); // latest changed session seen while a popup is open
  private readonly MAX_SAVED_SESSIONS = 200; // Maximum number of saved sessions to track
  private readonly MAX_IGNORED_SESSIONS = 500; // Maximum number of ignored sessions to track
  private readonly SESSION_TTL_DAYS = 60; // Remove sessions older than 60 days

  registerProvider(provider: AiHistoryProvider) {
    this.providers.set(provider.id, provider);
  }

  private computeSessionHash(session: AiSession): string {
    // Create a hash based on the number of turns and their content
    const content = session.turns.map(t => `${t.role}:${t.content}`).join('|');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  async startWatching(client: KbClient, context: vscode.ExtensionContext) {
    this.context = context;

    // Clean up active watchers
    for (const d of this.activeDisposables) {
      d.dispose();
    }
    this.activeDisposables = [];

    // Load persisted known session hashes
    try {
      const persistedHashes = context.globalState.get<[string, string][]>('kb.knownSessionHashes') || [];
      this.knownSessionHashes = new Map(persistedHashes);
    } catch {
      this.knownSessionHashes = new Map();
    }

    // Load persisted recent sessions
    try {
      this.recentSessions = context.globalState.get<AiSession[]>('kb.recentSessions') || [];
    } catch {
      this.recentSessions = [];
    }

    // Load persisted saved session keys
    try {
      const persistedSaved = context.globalState.get<[string, number][]>('kb.savedSessionsMap') || [];
      this.savedSessions = new Map(persistedSaved);
      this.enforceSessionLimits();
    } catch {
      this.savedSessions = new Map();
    }

    // Load persisted ignored session keys
    try {
      const persistedIgnored = context.globalState.get<[string, number][]>('kb.ignoredSessionsMap') || [];
      this.ignoredSessions = new Map(persistedIgnored);
      this.enforceSessionLimits();
    } catch {
      this.ignoredSessions = new Map();
    }

    // Load initial recent sessions from active providers to populate the list on startup
    for (const provider of this.providers.values()) {
      try {
        const enabled = await provider.isEnabled();
        if (!enabled) continue;
        const initial = await provider.getRecentSessions();
        for (const s of initial) {
          this.addOrUpdateRecentSession(s, true);
          
          // Record the hash of existing sessions so they don't trigger prompts
          const key = `${provider.id}:${s.sessionId}`;
          const hash = this.computeSessionHash(s);
          this.knownSessionHashes.set(key, hash);
        }
      } catch (err) {
        console.error(`Failed to load initial sessions for ${provider.id}:`, err);
      }
    }

    this.saveState();

    for (const provider of this.providers.values()) {
      try {
        const enabled = await provider.isEnabled();
        if (!enabled) continue;

        const disposable = provider.watchSessions((session) => {
          this.handleChangedSession(client, provider, session).catch((err) => {
            console.error(`Failed to handle changed session for ${provider.id}:`, err);
          });
        });

        this.activeDisposables.push(disposable);
        context.subscriptions.push(disposable);
      } catch (err) {
        console.error(`Failed to start watcher for provider ${provider.id}:`, err);
      }
    }
  }

  markSessionAsSaved(providerId: string, sessionId: string) {
    const key = `${providerId}:${sessionId}`;
    this.savedSessions.set(key, Date.now());
    this.ignoredSessions.delete(key);
    this.enforceSessionLimits();
    this.saveState();
  }

  markSessionAsIgnored(providerId: string, sessionId: string) {
    const key = `${providerId}:${sessionId}`;
    this.ignoredSessions.set(key, Date.now());
    this.savedSessions.delete(key);
    this.enforceSessionLimits();
    this.saveState();
  }

  private enforceSessionLimits() {
    const now = Date.now();
    const ttlMs = this.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

    // Remove entries older than TTL from both sets
    for (const [key, timestamp] of this.savedSessions.entries()) {
      if (now - timestamp > ttlMs) {
        this.savedSessions.delete(key);
      }
    }

    for (const [key, timestamp] of this.ignoredSessions.entries()) {
      if (now - timestamp > ttlMs) {
        this.ignoredSessions.delete(key);
      }
    }

    // Clean up hashes for sessions that are no longer saved or ignored
    for (const [key] of this.knownSessionHashes.entries()) {
      if (!this.savedSessions.has(key) && !this.ignoredSessions.has(key)) {
        // Only remove if the session is not in recent sessions either
        const [providerId, sessionId] = key.split(':');
        const isInRecent = this.recentSessions.some(
          s => s.providerId === providerId && s.sessionId === sessionId
        );
        if (!isInRecent) {
          this.knownSessionHashes.delete(key);
        }
      }
    }

    // Enforce limit on saved sessions using LRU (remove oldest by timestamp)
    if (this.savedSessions.size > this.MAX_SAVED_SESSIONS) {
      const entries = Array.from(this.savedSessions.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending (oldest first)
      const toRemove = entries.slice(0, entries.length - this.MAX_SAVED_SESSIONS);
      for (const [key] of toRemove) {
        this.savedSessions.delete(key);
      }
    }

    // Enforce limit on ignored sessions using LRU (remove oldest by timestamp)
    if (this.ignoredSessions.size > this.MAX_IGNORED_SESSIONS) {
      const entries = Array.from(this.ignoredSessions.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending (oldest first)
      const toRemove = entries.slice(0, entries.length - this.MAX_IGNORED_SESSIONS);
      for (const [key] of toRemove) {
        this.ignoredSessions.delete(key);
      }
    }
  }

  private saveState() {
    if (!this.context) return;
    try {
      const hashesArray = Array.from(this.knownSessionHashes.entries());
      this.context.globalState.update('kb.knownSessionHashes', hashesArray);
      this.context.globalState.update('kb.recentSessions', this.recentSessions);
      this.context.globalState.update('kb.savedSessionsMap', Array.from(this.savedSessions.entries()));
      this.context.globalState.update('kb.ignoredSessionsMap', Array.from(this.ignoredSessions.entries()));
    } catch (err) {
      console.error('Failed to save AI sessions state:', err);
    }
  }

  private addOrUpdateRecentSession(session: AiSession, skipSave = false) {
    const existingIdx = this.recentSessions.findIndex(
      s => s.providerId === session.providerId && s.sessionId === session.sessionId
    );
    if (existingIdx >= 0) {
      this.recentSessions[existingIdx] = session;
    } else {
      this.recentSessions.push(session);
    }

    // Sort by timestamp descending (newest first)
    this.recentSessions.sort((a, b) => b.timestamp - a.timestamp);

    // Limit to recent 20
    if (this.recentSessions.length > 20) {
      this.recentSessions = this.recentSessions.slice(0, 20);
    }

    if (!skipSave) {
      this.saveState();
    }
  }

  private rememberSessionHash(key: string, hash: string) {
    this.knownSessionHashes.set(key, hash);
    this.saveState();
  }

  private forgetSessionHash(key: string) {
    this.knownSessionHashes.delete(key);
    this.saveState();
  }

  private async askSessionAction(provider: AiHistoryProvider): Promise<SessionPromptAction | undefined | 'Timed out'> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<'Timed out'>((resolve) => {
      timeout = setTimeout(() => resolve('Timed out'), SESSION_PROMPT_TIMEOUT_MS);
    });

    const action = await Promise.race([
      vscode.window.showInformationMessage(
        `KB: New AI session detected from ${provider.name}. Do you want to save it as a note?`,
        'Auto-save',
        'Preview & Edit',
        'Ignore'
      ) as Promise<SessionPromptAction | undefined>,
      timeoutPromise,
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }

    if (action === 'Timed out') {
      logInfo('AI History', `Session prompt for ${provider.id} timed out after ${SESSION_PROMPT_TIMEOUT_MS}ms.`);
    }

    return action;
  }

  private async handleChangedSession(client: KbClient, provider: AiHistoryProvider, session: AiSession) {
    const key = `${provider.id}:${session.sessionId}`;
    const hash = this.computeSessionHash(session);
    const lastHash = this.knownSessionHashes.get(key);

    // Only trigger popup if content has actually changed.
    if (lastHash === hash) {
      return;
    }

    this.addOrUpdateRecentSession(session);

    // Saved sessions should keep auto-saving even if an older prompt for the
    // same session is still open or timed out.
    if (this.savedSessions.has(key)) {
      this.pendingPromptSessions.delete(key);
      const saved = await this.autoSaveSessionToVault(client, session);
      if (saved) {
        this.rememberSessionHash(key, hash);
        await this.processPendingPromptSession(client, provider, key);
      }
      return;
    }

    // If a prompt is already open, keep the newest version pending. Do not mark
    // the hash as known yet, otherwise the update is lost when the prompt closes.
    if (this.promptingSessions.has(key)) {
      this.pendingPromptSessions.set(key, session);
      return;
    }

    // If the session is ignored, do nothing until the user imports it manually.
    if (this.ignoredSessions.has(key)) {
      this.rememberSessionHash(key, hash);
      this.pendingPromptSessions.delete(key);
      return;
    }

    this.rememberSessionHash(key, hash);
    this.promptingSessions.add(key);
    try {
      const action = await this.askSessionAction(provider);

      if (action === 'Auto-save') {
        this.markSessionAsSaved(provider.id, session.sessionId);
        const saved = await this.saveSessionToVault(client, session);
        if (!saved) {
          this.forgetSessionHash(key);
        }
      } else if (action === 'Preview & Edit') {
        await this.openPreview(session);
      } else if (action === 'Ignore') {
        this.markSessionAsIgnored(provider.id, session.sessionId);
      } else if (action === 'Timed out') {
        return;
      }

      if (!this.savedSessions.has(key) && !this.ignoredSessions.has(key)) {
        this.forgetSessionHash(key);
      }
    } finally {
      this.promptingSessions.delete(key);
      await this.processPendingPromptSession(client, provider, key);
    }
  }

  private async processPendingPromptSession(client: KbClient, provider: AiHistoryProvider, key: string) {
    const pendingSession = this.pendingPromptSessions.get(key);
    if (!pendingSession) return;

    this.pendingPromptSessions.delete(key);
    await this.handleChangedSession(client, provider, pendingSession);
  }

  async showRecentSessions(client: KbClient) {
    // 1. Scan all sessions dynamically from all active providers
    const allSessions: AiSession[] = [];
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Scanning AI session logs...',
      cancellable: false
    }, async () => {
      for (const provider of this.providers.values()) {
        try {
          const enabled = await provider.isEnabled();
          if (!enabled) continue;
          const sessions = await provider.getRecentSessions();
          allSessions.push(...sessions);
        } catch (err) {
          console.error(`Failed to load sessions for ${provider.id}:`, err);
        }
      }
    });

    // Sort all sessions by timestamp descending (newest first)
    allSessions.sort((a, b) => b.timestamp - a.timestamp);

    if (allSessions.length === 0) {
      vscode.window.showInformationMessage('No recent AI sessions detected from Claude Code or Codex.');
      return;
    }

    interface SessionQuickPickItem extends vscode.QuickPickItem {
      session?: AiSession;
      isLoadMore?: boolean;
    }

    // 2. Set up QuickPick for pagination / infinite scroll
    const quickPick = vscode.window.createQuickPick<SessionQuickPickItem>();
    quickPick.title = 'Select a recent AI session to import';
    quickPick.placeholder = 'Search by title...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const PAGE_SIZE = 20;
    let displayedCount = PAGE_SIZE;

    // Helper to build list of items
    const getItems = (filterQuery = '') => {
      const filtered = filterQuery
        ? allSessions.filter(s => s.title.toLowerCase().includes(filterQuery.toLowerCase()))
        : allSessions;

      const slice = filtered.slice(0, displayedCount);
      const items: SessionQuickPickItem[] = slice.map(session => ({
        label: session.title,
        description: this.providers.get(session.providerId)?.name || session.providerId,
        detail: `Modified: ${new Date(session.timestamp).toLocaleString()}`,
        session
      }));

      // Add "Load More" indicator if there are remaining sessions
      if (filtered.length > displayedCount) {
        items.push({
          label: '$(arrow-down) Load More...',
          description: `Showing ${displayedCount} of ${filtered.length} sessions`,
          detail: 'Select this item or scroll down to load more',
          isLoadMore: true
        });
      }

      return items;
    };

    quickPick.items = getItems();

    // 3. Handle infinite scroll / selection change (throttled)
    let isHandlingActiveChange = false;
    quickPick.onDidChangeActive(active => {
      if (isHandlingActiveChange) return;
      const activeItem = active[0];
      if (!activeItem) return;

      const items = quickPick.items;
      const activeIndex = items.indexOf(activeItem);

      // Trigger if active item is "Load More..." or is in the last 2 positions and "Load More" exists
      if (activeItem.isLoadMore || (activeIndex >= items.length - 2 && items[items.length - 1].isLoadMore)) {
        isHandlingActiveChange = true;
        
        setTimeout(() => {
          displayedCount += PAGE_SIZE;
          
          const query = quickPick.value;
          quickPick.items = getItems(query);
          
          // Re-focus near the previous position
          const newIndex = Math.min(activeIndex, quickPick.items.length - 1);
          quickPick.activeItems = [quickPick.items[newIndex]];
          
          isHandlingActiveChange = false;
        }, 150);
      }
    });

    // Reset page count on filter query change
    quickPick.onDidChangeValue(value => {
      displayedCount = PAGE_SIZE;
      quickPick.items = getItems(value);
    });

    // Handle item acceptance
    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (!selected) return;

      if (selected.isLoadMore) {
        displayedCount += PAGE_SIZE;
        quickPick.items = getItems(quickPick.value);
        return;
      }

      quickPick.hide();
      quickPick.dispose();

      if (selected.session) {
        const action = await vscode.window.showInformationMessage(
          `Selected session: "${selected.label}"`,
          'Auto-save',
          'Preview & Edit'
        );
        if (action === 'Auto-save') {
          this.markSessionAsSaved(selected.session.providerId, selected.session.sessionId);
          await this.saveSessionToVault(client, selected.session);
        } else if (action === 'Preview & Edit') {
          await this.openPreview(selected.session);
        }
      }
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
    });

    quickPick.show();
  }

  private getTitleWithDate(session: AiSession): string {
    const dateObj = new Date(session.timestamp);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    return `${session.title} (${formattedDate})`;
  }

  private getMarkdownText(session: AiSession): string {
    const titleWithDate = this.getTitleWithDate(session);
    let rawText = `# ${titleWithDate}\n\n`;
    rawText += `Source: ${this.providers.get(session.providerId)?.name || session.providerId}\n`;
    if (session.projectSlug) {
      rawText += `Project: ${session.projectSlug}\n`;
    }
    rawText += `\n---\n\n`;
    
    for (const turn of session.turns) {
      const roleHeader = turn.role === 'user' ? '👤 User' : '🤖 Assistant';
      rawText += `### ${roleHeader}\n${turn.content}\n\n`;
    }
    return rawText;
  }

  async openPreview(session: AiSession) {
    try {
      const rawText = this.getMarkdownText(session);
      const doc = await vscode.workspace.openTextDocument({
        content: rawText,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);
      
      const choice = await vscode.window.showInformationMessage(
        'KB: You are viewing the AI conversation. Edit the file as you wish, then choose Save Now.',
        'Save Now'
      );
      if (choice === 'Save Now') {
        vscode.commands.executeCommand('kb.saveActiveFile', session.sessionId, session.providerId);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to open preview: ${err.message || err}`);
    }
  }

  private async saveSessionToVault(client: KbClient, session: AiSession): Promise<boolean> {
    try {
      const titleWithDate = this.getTitleWithDate(session);
      const rawText = this.getMarkdownText(session);
      await client.createNote({
        title: titleWithDate,
        rawText,
        projectSlug: session.projectSlug || client.defaultProjectSlug || 'inbox',
        sourceChannel: 'ai-chat',
        source: session.providerId,
        sessionId: session.sessionId,
      });

      vscode.window.showInformationMessage('Note saved to Knowledge Vault successfully!');
      vscode.commands.executeCommand('kb.refresh');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save note: ${err.message || err}`);
      return false;
    }
  }

  private async autoSaveSessionToVault(client: KbClient, session: AiSession): Promise<boolean> {
    try {
      const titleWithDate = this.getTitleWithDate(session);
      const rawText = this.getMarkdownText(session);
      await client.createNote({
        title: titleWithDate,
        rawText,
        projectSlug: session.projectSlug || client.defaultProjectSlug || 'inbox',
        sourceChannel: 'ai-chat',
        source: session.providerId,
        sessionId: session.sessionId,
      });

      vscode.commands.executeCommand('kb.refresh');
      return true;
    } catch (err: any) {
      logInfo('AI History', `Failed to auto-save note: ${toMessage(err)}`);
      return false;
    }
  }
}
