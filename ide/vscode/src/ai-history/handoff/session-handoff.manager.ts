import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type KbClient, isConfigured } from '../../kb-client';
import { toMessage } from '../../error-reporter';
import type { AiHistoryProvider, AiSession } from '../types';
import type { KbNote } from '../../types';
import { SessionHandoffViewProvider } from '../../providers/session-handoff-view.provider';
import {
  type HandoffSessionTarget,
  type HandoffQuickPickItem,
  CLOUD_SESSION_BADGE,
  CLOUD_SESSION_FETCH_LIMIT,
  CLOUD_SESSION_FETCH_TIMEOUT_MS,
  buildHandoffQuickPickItems,
  resolveHandoffSessionPayload,
  fetchWithTimeout,
  isAiSessionNote,
  formatProviderDisplayName,
  pickBestCandidateSession,
} from './session-handoff.utils';

export type { HandoffSessionTarget };

export function loadLastHandoffFromFile(): string | null {
  try {
    const lastHandoffPath = path.join(os.homedir(), '.config', 'kote', 'last-handoff.md');
    if (fs.existsSync(lastHandoffPath)) {
      return fs.readFileSync(lastHandoffPath, 'utf8');
    }
  } catch {
    // Best-effort cache read for last handoff
  }
  return null;
}

export function persistLastHandoffFile(markdown: string): void {
  try {
    const koteDir = path.join(os.homedir(), '.config', 'kote');
    if (!fs.existsSync(koteDir)) {
      fs.mkdirSync(koteDir, { recursive: true });
    }
    const lastHandoffPath = path.join(koteDir, 'last-handoff.md');
    fs.writeFileSync(lastHandoffPath, markdown, 'utf8');
  } catch {
    // Best-effort cache write for last handoff
  }
}

export function injectHandoffIntoActiveTerminal(markdown: string): boolean {
  const terminal = vscode.window.activeTerminal;
  if (!terminal) return false;

  terminal.show(true);

  // Normalize line endings
  const normalized = markdown.replace(/\r\n/g, '\n').trim();

  // Use bracketed paste mode (\x1b[200~ ... \x1b[201~) so CLI interactive prompts (Antigravity, Claude, OpenCode)
  // treat the entire multiline payload as a single atomic paste rather than submitting on every newline.
  const bracketedPayload = `\x1b[200~${normalized}\x1b[201~`;

  terminal.sendText(bracketedPayload, false);
  return true;
}

export class SessionHandoffManager {
  private lastHandoffMarkdown: string | null = null;
  private promptedHandoffPairs = new Set<string>();
  private readonly HANDOFF_RECENCY_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

  constructor(
    private readonly getClient: () => KbClient,
    private readonly getProviders: () => Map<string, AiHistoryProvider>,
    private readonly formatSessionMarkdown: (session: AiSession) => string,
    private readonly getExtensionUri?: () => vscode.Uri,
  ) {}

  setActiveHandoffMarkdown(markdown: string): void {
    this.lastHandoffMarkdown = markdown;
  }

  loadLastHandoffFromFile(): string | null {
    return loadLastHandoffFromFile();
  }

  async generateHandoffFromLatestCloudSession(projectSlug?: string): Promise<string | null> {
    try {
      const client = this.getClient();
      const res = await client.getSessionHandoff({
        autoDetectPrevious: true,
        projectSlug,
      });
      if (res?.handoffMarkdown) {
        this.lastHandoffMarkdown = res.handoffMarkdown;
        persistLastHandoffFile(res.handoffMarkdown);
        return res.handoffMarkdown;
      }
    } catch {
      // Best-effort retrieval from cloud
    }
    return null;
  }

  async findCandidateCloudSession(
    targetProviderId: string,
    projectSlug?: string,
    excludeNoteIdOrSessionId?: string,
  ): Promise<HandoffSessionTarget | null> {
    try {
      const notes = await this.fetchCloudNotes(projectSlug);
      const now = Date.now();
      for (const note of notes) {
        if (!isAiSessionNote(note)) continue;
        if (excludeNoteIdOrSessionId && (note.id === excludeNoteIdOrSessionId || note.sessionId === excludeNoteIdOrSessionId)) {
          continue;
        }
        const noteProvider = note.source || 'ai-session';
        const noteDate = note.occurredAt || note.createdAt || note.date;
        const timestamp = noteDate ? new Date(noteDate).getTime() : 0;
        if (now - timestamp > this.HANDOFF_RECENCY_MAX_AGE_MS) continue;

        return {
          noteId: note.id,
          title: note.title,
          providerId: noteProvider,
          projectSlug: note.projectSlug,
          timestamp,
          rawText: note.markdown || note.summary || note.content,
        };
      }
    } catch {
      // Best-effort background cloud check
    }
    return null;
  }

  async onHarnessLaunched(
    targetProviderId: string,
    recentSessions: AiSession[],
    projectSlug?: string,
  ): Promise<void> {
    const localCandidate = this.findCandidatePreviousSession(targetProviderId, recentSessions);
    let cloudCandidate: HandoffSessionTarget | null = null;

    if (isConfigured()) {
      cloudCandidate = await this.findCandidateCloudSession(targetProviderId, projectSlug);
    }

    const candidate = pickBestCandidateSession(localCandidate, cloudCandidate);
    if (!candidate) return;

    const candidateKey = 'sessionId' in candidate ? candidate.sessionId : candidate.noteId;
    const launchKey = `launch:${candidateKey}->${targetProviderId}`;
    if (this.promptedHandoffPairs.has(launchKey)) return;
    this.promptedHandoffPairs.add(launchKey);

    const providers = this.getProviders();
    const prevProviderName = 'sessionId' in candidate
      ? (providers.get(candidate.providerId)?.name || candidate.providerId)
      : `${CLOUD_SESSION_BADGE} ${formatProviderDisplayName(candidate.providerId, providers)}`;
    const newProviderName = providers.get(targetProviderId)?.name || targetProviderId;

    void this.promptHandoffForCandidate(candidate, prevProviderName, newProviderName);
  }

  async onNewSessionDetected(
    currentProvider: AiHistoryProvider,
    currentSession: AiSession,
    recentSessions: AiSession[],
    projectSlug?: string,
  ): Promise<void> {
    const localCandidate = this.findCandidatePreviousSession(
      currentSession.providerId,
      recentSessions,
      currentSession.sessionId,
    );
    let cloudCandidate: HandoffSessionTarget | null = null;

    if (isConfigured()) {
      cloudCandidate = await this.findCandidateCloudSession(
        currentSession.providerId,
        projectSlug,
        currentSession.sessionId,
      );
    }

    const candidate = pickBestCandidateSession(localCandidate, cloudCandidate);
    if (!candidate) return;

    const candidateKey = 'sessionId' in candidate ? candidate.sessionId : candidate.noteId;
    const pairKey = `${candidateKey}->${currentSession.sessionId}`;
    if (this.promptedHandoffPairs.has(pairKey)) return;
    this.promptedHandoffPairs.add(pairKey);

    const providers = this.getProviders();
    const prevProviderName = 'sessionId' in candidate
      ? (providers.get(candidate.providerId)?.name || candidate.providerId)
      : `${CLOUD_SESSION_BADGE} ${formatProviderDisplayName(candidate.providerId, providers)}`;
    const newProviderName = currentProvider.name;

    void this.promptHandoffForCandidate(candidate, prevProviderName, newProviderName);
  }

  findCandidatePreviousSession(
    targetProviderId: string,
    recentSessions: AiSession[],
    excludeSessionId?: string,
  ): AiSession | null {
    const now = Date.now();
    for (const s of recentSessions) {
      if (excludeSessionId && s.sessionId === excludeSessionId) continue;
      if (s.turns.length < 2) continue;
      if (now - s.timestamp > this.HANDOFF_RECENCY_MAX_AGE_MS) continue;
      return s;
    }
    return null;
  }

  private async promptHandoffForCandidate(
    candidate: HandoffSessionTarget,
    prevProviderName: string,
    newProviderName: string,
  ): Promise<void> {
    const message = `Kote: Previous session detected in ${prevProviderName} ("${candidate.title}"). Inject this context into ${newProviderName}?`;
    const action = await vscode.window.showInformationMessage(
      message,
      'Inject Now',
      'Review and Accept',
      'Ignore',
    );

    if (action === 'Inject Now') {
      await this.generateAndInjectHandoff(candidate, newProviderName);
    } else if (action === 'Review and Accept') {
      await this.generateAndReviewHandoff(candidate, newProviderName);
    }
  }

  private resolveHandoffSession(previousSession: HandoffSessionTarget) {
    return resolveHandoffSessionPayload(previousSession, this.formatSessionMarkdown);
  }

  private async fetchCloudNotes(projectSlug?: string): Promise<KbNote[]> {
    try {
      const client = this.getClient();
      const notes = await fetchWithTimeout(
        client.listRecentNotes(projectSlug, CLOUD_SESSION_FETCH_LIMIT),
        CLOUD_SESSION_FETCH_TIMEOUT_MS,
      );
      if (notes.length > 0 || !projectSlug) {
        return notes;
      }
      return await fetchWithTimeout(
        client.listRecentNotes(undefined, CLOUD_SESSION_FETCH_LIMIT),
        CLOUD_SESSION_FETCH_TIMEOUT_MS,
      );
    } catch {
      return [];
    }
  }

  async generateAndInjectHandoff(
    previousSession: HandoffSessionTarget,
    targetProviderName?: string,
  ): Promise<string | null> {
    try {
      const client = this.getClient();
      const targetName = targetProviderName || 'new chat';
      const { payload, providerId, title, projectSlug, timestamp } = this.resolveHandoffSession(previousSession);

      const res = await client.getSessionHandoff(payload);

      if (res?.handoffMarkdown) {
        this.lastHandoffMarkdown = res.handoffMarkdown;
        persistLastHandoffFile(res.handoffMarkdown);
        await vscode.env.clipboard.writeText(res.handoffMarkdown);

        const injected = injectHandoffIntoActiveTerminal(res.handoffMarkdown);
        const msg = injected
          ? `Kote: Session handoff context injected into active terminal for ${targetName}.`
          : `Kote: Session handoff context copied to clipboard for ${targetName}.`;

        const choice = await vscode.window.showInformationMessage(
          msg,
          'View Injected Context',
        );
        if (choice === 'View Injected Context') {
          await this.openHandoffPreview(res.handoffMarkdown, targetName, {
            sourceProvider: providerId,
            sourceTitle: title,
            sourceTimestamp: timestamp,
            projectSlug,
          });
        }
        return res.handoffMarkdown;
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to generate session handoff: ${toMessage(err)}`);
    }
    return null;
  }

  async generateAndReviewHandoff(
    previousSession: HandoffSessionTarget,
    targetProviderName?: string,
  ): Promise<void> {
    try {
      const client = this.getClient();
      const targetName = targetProviderName || 'new chat';
      const extensionUri = this.getExtensionUri?.();
      const { payload, providerId, title, projectSlug, timestamp } = this.resolveHandoffSession(previousSession);

      if (extensionUri) {
        SessionHandoffViewProvider.show(
          {
            sourceProvider: providerId,
            targetProviderName: targetName,
            sourceTitle: title,
            sourceTimestamp: timestamp,
            projectSlug,
          },
          extensionUri,
          async () => {
            const res = await client.getSessionHandoff(payload);
            this.lastHandoffMarkdown = res.handoffMarkdown;
            return res.handoffMarkdown;
          },
          (markdown) => {
            this.lastHandoffMarkdown = markdown;
          },
        );
        return;
      }

      const res = await client.getSessionHandoff(payload);

      if (res?.handoffMarkdown) {
        this.lastHandoffMarkdown = res.handoffMarkdown;
        await this.openHandoffPreview(res.handoffMarkdown, targetName, {
          sourceProvider: providerId,
          sourceTitle: title,
          sourceTimestamp: timestamp,
          projectSlug,
        });
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to generate session handoff: ${toMessage(err)}`);
    }
  }

  async openHandoffPreview(
    markdown: string,
    targetProviderName: string,
    meta?: {
      sourceProvider?: string;
      sourceTitle?: string;
      sourceTimestamp?: string;
      projectSlug?: string;
    },
  ): Promise<void> {
    try {
      const extensionUri = this.getExtensionUri?.();
      if (extensionUri) {
        SessionHandoffViewProvider.show(
          {
            initialMarkdown: markdown,
            sourceProvider: meta?.sourceProvider || 'Previous Session',
            targetProviderName,
            sourceTitle: meta?.sourceTitle,
            sourceTimestamp: meta?.sourceTimestamp,
            projectSlug: meta?.projectSlug,
          },
          extensionUri,
          undefined,
          () => {
            this.lastHandoffMarkdown = markdown;
          },
        );
        return;
      }

      const doc = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to open handoff preview: ${toMessage(err)}`);
    }
  }

  getActiveHandoffMarkdown(): string | null {
    return this.lastHandoffMarkdown;
  }

  async showHandoffQuickPick(recentSessions: AiSession[], projectSlug?: string): Promise<void> {
    const providers = this.getProviders();
    const initialItems = buildHandoffQuickPickItems(recentSessions, [], providers);
    const canFetchCloud = isConfigured();

    if (initialItems.length === 0 && !canFetchCloud) {
      vscode.window.showInformationMessage('Kote: No recent AI sessions available for handoff.');
      return;
    }

    const quickPick = vscode.window.createQuickPick<HandoffQuickPickItem>();
    quickPick.title = 'Session Handoff';
    quickPick.placeholder = initialItems.length > 0
      ? 'Select a recent session to generate handoff context'
      : 'Loading recent sessions from Kote cloud...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = initialItems;

    let isDisposed = false;

    if (canFetchCloud) {
      quickPick.busy = true;
      void this.fetchCloudNotes(projectSlug).then((cloudNotes) => {
        if (isDisposed) return;
        quickPick.busy = false;

        const mergedItems = buildHandoffQuickPickItems(recentSessions, cloudNotes, providers);
        if (mergedItems.length === 0) {
          quickPick.hide();
          vscode.window.showInformationMessage('Kote: No recent AI sessions available for handoff.');
          return;
        }

        quickPick.items = mergedItems;
        quickPick.placeholder = 'Select a recent session to generate handoff context';
      });
    }

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      quickPick.hide();
      if (!selected) return;

      if (selected.target.kind === 'local') {
        await this.generateAndReviewHandoff(selected.target.session);
      } else {
        const note = selected.target.note;
        await this.generateAndReviewHandoff({
          noteId: note.id,
          title: note.title,
          providerId: selected.target.providerId,
          projectSlug: note.projectSlug,
          timestamp: note.createdAt || note.date,
          rawText: note.markdown || note.summary || note.content,
        });
      }
    });

    quickPick.onDidHide(() => {
      isDisposed = true;
      quickPick.dispose();
    });

    quickPick.show();
  }
}
