import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession } from './types';
import type { KbClient } from '../kb-client';
import { logInfo, toMessage } from '../error-reporter';

type SessionPromptAction = 'Auto-save' | 'Preview & Edit' | 'Ignore';
type AiSessionSaveMode = 'auto-save' | 'ask' | 'ignore-all';

const SESSION_MODE_PICKED_KEY = 'kote.aiSessionModePicked';

const SESSION_PROMPT_TIMEOUT_MS = 2 * 60 * 1000;

const MAX_UNSYNCED_SESSIONS_CHECK = 100; // Limit for scanned unsynced sessions

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
      const persistedHashes = context.globalState.get<[string, string][]>('kote.knownSessionHashes') || [];
      this.knownSessionHashes = new Map(persistedHashes);
    } catch {
      this.knownSessionHashes = new Map();
    }

    // Load persisted recent sessions
    try {
      this.recentSessions = context.globalState.get<AiSession[]>('kote.recentSessions') || [];
    } catch {
      this.recentSessions = [];
    }

    // Load persisted saved session keys
    try {
      const persistedSaved = context.globalState.get<[string, number][]>('kote.savedSessionsMap') || [];
      this.savedSessions = new Map(persistedSaved);
      this.enforceSessionLimits();
    } catch {
      this.savedSessions = new Map();
    }

    // Load persisted ignored session keys
    try {
      const persistedIgnored = context.globalState.get<[string, number][]>('kote.ignoredSessionsMap') || [];
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
        const initial = await provider.getRecentSessions(MAX_UNSYNCED_SESSIONS_CHECK); // Fetch all to populate known hashes of existing sessions
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

    // Watch for window focus to trigger a check immediately
    const focusDisposable = vscode.window.onDidChangeWindowState(async (e) => {
      if (e.focused) {
        await this.checkAllProviders(client);
      }
    });
    this.activeDisposables.push(focusDisposable);
    context.subscriptions.push(focusDisposable);

    // Periodic check every 15 seconds (only when window is active to conserve resources)
    const interval = setInterval(async () => {
      if (vscode.window.state.focused) {
        await this.checkAllProviders(client);
      }
    }, 15000);
    this.activeDisposables.push(new vscode.Disposable(() => clearInterval(interval)));

    // Prompt save mode selection on first extension launch
    const modePicked = context.globalState.get<boolean>(SESSION_MODE_PICKED_KEY);
    if (!modePicked) {
      setTimeout(() => {
        this.promptModeSelection(context).catch((err) => {
          console.error('Failed to prompt AI session mode selection:', err);
        });
      }, 1000);
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
      this.context.globalState.update('kote.knownSessionHashes', hashesArray);
      this.context.globalState.update('kote.recentSessions', this.recentSessions);
      this.context.globalState.update('kote.savedSessionsMap', Array.from(this.savedSessions.entries()));
      this.context.globalState.update('kote.ignoredSessionsMap', Array.from(this.ignoredSessions.entries()));
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
        `Kote: New AI session detected from ${provider.name}. Do you want to save it as a note?`,
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

  private getAiSessionSaveMode(): AiSessionSaveMode {
    return vscode.workspace
      .getConfiguration()
      .get<AiSessionSaveMode>('kote.aiSessionSaveMode', 'auto-save');
  }

  async promptModeSelection(context: vscode.ExtensionContext): Promise<void> {
    interface ModeItem extends vscode.QuickPickItem { mode: AiSessionSaveMode }

    const currentMode = this.getAiSessionSaveMode();

    const items: ModeItem[] = [
      {
        label: '$(zap) Auto-save (Recommended)',
        description: currentMode === 'auto-save' ? '\u2713 current' : '',
        detail: 'Saves AI sessions automatically in the background. A light notification appears when saved.',
        mode: 'auto-save',
      },
      {
        label: '$(comment-discussion) Ask before saving',
        description: currentMode === 'ask' ? '\u2713 current' : '',
        detail: 'Shows a confirmation popup for each detected AI session before saving.',
        mode: 'ask',
      },
      {
        label: '$(mute) Ignore all sessions',
        description: currentMode === 'ignore-all' ? '\u2713 current' : '',
        detail: 'Does not save or prompt for any AI session. Sessions can still be imported manually via the history view.',
        mode: 'ignore-all',
      },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Kote \u2014 AI Session Save Mode',
      placeHolder: 'How should Kote handle newly detected AI sessions?',
      ignoreFocusOut: true,
    });

    if (!picked) return;

    const config = vscode.workspace.getConfiguration();
    const inspection = config.inspect('kote.aiSessionSaveMode');

    try {
      await config.update('kote.aiSessionSaveMode', picked.mode, vscode.ConfigurationTarget.Global);
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        await config.update('kote.aiSessionSaveMode', picked.mode, vscode.ConfigurationTarget.Workspace);
      }
      if (inspection?.workspaceFolderValue !== undefined) {
        await config.update('kote.aiSessionSaveMode', picked.mode, vscode.ConfigurationTarget.WorkspaceFolder);
      }
    } catch (err) {
      console.error('Failed to update kote.aiSessionSaveMode configuration:', err);
    }

    context.globalState.update(SESSION_MODE_PICKED_KEY, true);

    const label = picked.mode === 'auto-save' ? 'Auto-save' : picked.mode === 'ask' ? 'Ask before saving' : 'Ignore all sessions';
    vscode.window.showInformationMessage(`Kote: AI session mode set to "${label}".`);
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

    // In auto-save mode: save new sessions immediately without prompting.
    if (this.getAiSessionSaveMode() === 'auto-save') {
      this.markSessionAsSaved(provider.id, session.sessionId);
      const saved = await this.autoSaveSessionToVault(client, session);
      if (saved) this.rememberSessionHash(key, hash);
      else this.forgetSessionHash(key);
      return;
    }

    // In ignore-all mode: silently discard new sessions without saving or prompting.
    if (this.getAiSessionSaveMode() === 'ignore-all') {
      this.rememberSessionHash(key, hash);
      return;
    }

    this.promptingSessions.add(key);
    try {
      const action = await this.askSessionAction(provider);

      if (action === 'Auto-save') {
        this.markSessionAsSaved(provider.id, session.sessionId);
        const saved = await this.saveSessionToVault(client, session);
        if (saved) {
          this.rememberSessionHash(key, hash);
        } else {
          this.savedSessions.delete(key);
          this.forgetSessionHash(key);
        }
      } else if (action === 'Preview & Edit') {
        this.openPreview(session);
        this.rememberSessionHash(key, hash);
      } else if (action === 'Ignore') {
        this.markSessionAsIgnored(provider.id, session.sessionId);
        this.rememberSessionHash(key, hash);
      } else if (action === undefined) {
        // User closed/dismissed the popup. Don't spam them for the same content state.
        this.rememberSessionHash(key, hash);
      } else if (action === 'Timed out') {
        this.forgetSessionHash(key);
        return;
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
        'Kote: You are viewing the AI conversation. Edit the file as you wish, then choose Save Now.',
        'Save Now'
      );
      if (choice === 'Save Now') {
        await vscode.commands.executeCommand('kote.saveActiveFile', session.sessionId, session.providerId);
      }
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Failed to open preview: ${toMessage(err)}`);
    }
  }

  private async saveSessionToVault(client: KbClient, session: AiSession, silent: boolean = false): Promise<boolean> {
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

      if (!silent) {
        vscode.window.showInformationMessage('Note saved to Kote successfully!');
      }
      vscode.commands.executeCommand('kote.refresh');
      return true;
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Failed to save note: ${toMessage(err)}`);
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

      vscode.commands.executeCommand('kote.refresh');
      vscode.window.showInformationMessage(`AI session auto-saved to Kote — project: ${session.projectSlug || client.defaultProjectSlug || 'inbox'}.`);
      return true;
    } catch (err: unknown) {
      logInfo('AI History', `Failed to auto-save note: ${toMessage(err)}`);
      return false;
    }
  }

  private lastSyncPromptTime = 0;
  private readonly SYNC_PROMPT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours cooldown

  async getUnsyncedSessions(): Promise<AiSession[]> {
    const unsynced: AiSession[] = [];
    for (const provider of this.providers.values()) {
      try {
        const enabled = await provider.isEnabled();
        if (!enabled) continue;
        const sessions = await provider.getRecentSessions(MAX_UNSYNCED_SESSIONS_CHECK);
        for (const s of sessions) {
          const key = `${provider.id}:${s.sessionId}`;
          if (!this.savedSessions.has(key) && !this.ignoredSessions.has(key)) {
            unsynced.push(s);
          }
        }
      } catch (err) {
        console.error(`Failed to scan unsynced sessions for provider ${provider.id}:`, err);
      }
    }
    unsynced.sort((a, b) => b.timestamp - a.timestamp);
    return unsynced.slice(0, MAX_UNSYNCED_SESSIONS_CHECK);
  }

  async syncSessions(client: KbClient, sessionsToSync: { providerId: string, sessionId: string }[]): Promise<boolean> {
    const resolvedSessions: { item: { providerId: string, sessionId: string }, session: AiSession }[] = [];
    // Group by providerId to avoid fetching recent sessions multiple times for the same provider
    const sessionsByProvider = new Map<string, AiSession[]>();
    const providerIds = new Set(sessionsToSync.map(item => item.providerId));

    for (const providerId of providerIds) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;
      try {
        const sessions = await provider.getRecentSessions(MAX_UNSYNCED_SESSIONS_CHECK);
        sessionsByProvider.set(providerId, sessions);
      } catch (err) {
        console.error(`Failed to load sessions for provider ${providerId}:`, err);
      }
    }

    for (const item of sessionsToSync) {
      const sessions = sessionsByProvider.get(item.providerId);
      if (!sessions) continue;
      const session = sessions.find(s => s.sessionId === item.sessionId);
      if (session) {
        resolvedSessions.push({ item, session });
      }
    }

    // Sort by timestamp ascending (oldest first) so that the oldest sessions
    // are created first in the KB, leaving the newest sessions on top.
    resolvedSessions.sort((a, b) => a.session.timestamp - b.session.timestamp);

    let completed = true;
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Syncing AI sessions to Kote...',
      cancellable: true
    }, async (progress, token) => {
      let stopped = false;
      token.onCancellationRequested(() => {
        stopped = true;
        completed = false;
      });

      const total = resolvedSessions.length;
      for (let i = 0; i < total; i++) {
        if (stopped) {
          vscode.window.showInformationMessage('Sync stopped by user.');
          break;
        }

        const { item, session } = resolvedSessions[i];
        const titleWithDate = this.getTitleWithDate(session);
        progress.report({
          message: `(${i + 1}/${total}) ${titleWithDate}`,
          increment: (1 / total) * 100
        });

        this.markSessionAsSaved(item.providerId, item.sessionId);
        const saved = await this.saveSessionToVault(client, session, true);
        if (saved) {
          const key = `${item.providerId}:${item.sessionId}`;
          const hash = this.computeSessionHash(session);
          this.rememberSessionHash(key, hash);
        } else {
          // clean up so they can retry
          const key = `${item.providerId}:${item.sessionId}`;
          this.savedSessions.delete(key);
          this.saveState();
        }
      }
    });
    return completed;
  }

  async checkUnsyncedAndPrompt(client: KbClient) {
    const now = Date.now();
    if (now - this.lastSyncPromptTime < this.SYNC_PROMPT_COOLDOWN_MS) {
      return;
    }
    this.lastSyncPromptTime = now;

    try {
      const unsynced = await this.getUnsyncedSessions();
      if (unsynced.length > 0) {
        const choice = await vscode.window.showInformationMessage(
          `Kote: You have ${unsynced.length} unsynced AI chat sessions. Do you want to sync them with Kote?`,
          'Sync All',
          'Review Sessions',
          'Later'
        );
        if (choice === 'Sync All') {
          const sessionsToSync = unsynced.map(s => ({ providerId: s.providerId, sessionId: s.sessionId }));
          const completed = await this.syncSessions(client, sessionsToSync);
          if (completed) {
            vscode.window.showInformationMessage(`Successfully synced ${unsynced.length} AI sessions to Kote.`);
          }
          // Notify the webview if it is active so it can reload
          vscode.commands.executeCommand('kote.refresh');
        } else if (choice === 'Review Sessions') {
          await vscode.commands.executeCommand('kote.sidebarView.focus');
          await vscode.commands.executeCommand('kote.openSyncTab');
        }
      }
    } catch (err) {
      console.error('Failed checking unsynced sessions:', err);
    }
  }

  private async checkAllProviders(client: KbClient) {
    for (const provider of this.providers.values()) {
      try {
        const enabled = await provider.isEnabled();
        if (!enabled) continue;
        const sessions = await provider.getRecentSessions();
        for (const s of sessions) {
          await this.handleChangedSession(client, provider, s);
        }
      } catch {
        // silent fallback
      }
    }
  }
}
