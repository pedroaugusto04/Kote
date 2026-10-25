import type * as vscode from 'vscode';
import { SOURCE_CHANNELS } from '../../constants';
import type { KbNote } from '../../types';
import { matchProviderFromHarnessName, AI_PROVIDER_NAME } from '../constants';
import type { AiHistoryProvider, AiSession } from '../types';

export const CLOUD_SESSION_BADGE = '[Cloud]';
export const CLOUD_SESSION_FETCH_LIMIT = 30;
export const CLOUD_SESSION_FETCH_TIMEOUT_MS = 4000;

export type HandoffSessionTarget =
  | AiSession
  | {
      noteId: string;
      title: string;
      providerId: string;
      projectSlug?: string;
      timestamp?: number | string;
      rawText?: string;
    };

export type HandoffQuickPickTarget =
  | { kind: 'local'; session: AiSession }
  | { kind: 'cloud'; note: KbNote; providerId: string };

export interface HandoffQuickPickItem extends vscode.QuickPickItem {
  target: HandoffQuickPickTarget;
  timestamp: number;
}

export interface ResolvedHandoffPayload {
  payload: {
    noteId?: string;
    provider?: string;
    projectSlug?: string;
    rawText?: string;
  };
  providerId: string;
  title: string;
  projectSlug?: string;
  timestamp: string;
}

export function isAiSessionNote(note: KbNote): boolean {
  if (note.sourceChannel === SOURCE_CHANNELS.AI_CHAT || note.source === SOURCE_CHANNELS.AI_CHAT) {
    return true;
  }
  if (note.sessionId && note.sessionId.trim().length > 0) {
    return true;
  }
  return Boolean(note.source && matchProviderFromHarnessName(note.source));
}

export function formatProviderDisplayName(
  providerId?: string,
  providers?: Map<string, AiHistoryProvider>,
): string {
  if (!providerId) return 'AI Session';
  if (providers?.has(providerId)) {
    return providers.get(providerId)!.name;
  }
  const matched = matchProviderFromHarnessName(providerId);
  if (matched) {
    switch (matched) {
      case 'claude-code':
        return AI_PROVIDER_NAME['claude-code'];
      case 'codex-cli':
        return AI_PROVIDER_NAME['codex-cli'];
      case 'antigravity':
        return AI_PROVIDER_NAME['antigravity'];
      case 'open-code':
        return AI_PROVIDER_NAME['open-code'];
    }
  }
  return providerId;
}

export function buildHandoffQuickPickItems(
  localSessions: AiSession[],
  cloudNotes: KbNote[],
  providers: Map<string, AiHistoryProvider>,
): HandoffQuickPickItem[] {
  const items: HandoffQuickPickItem[] = [];
  const localSessionIds = new Set<string>();

  for (const session of localSessions) {
    if (session.turns.length < 1) continue;

    if (session.sessionId) {
      localSessionIds.add(session.sessionId);
    }
    items.push({
      label: session.title,
      description: providers.get(session.providerId)?.name || session.providerId,
      detail: `Modified: ${new Date(session.timestamp).toLocaleString()}`,
      target: { kind: 'local', session },
      timestamp: session.timestamp,
    });
  }

  const seenRemoteKeys = new Set<string>();
  for (const note of cloudNotes) {
    if (!isAiSessionNote(note)) continue;
    if (note.sessionId && localSessionIds.has(note.sessionId)) continue;

    const remoteKey = note.sessionId || note.id;
    if (seenRemoteKeys.has(remoteKey)) continue;
    seenRemoteKeys.add(remoteKey);

    const providerName = formatProviderDisplayName(note.source, providers);
    const noteDate = note.createdAt || note.date || note.updatedAt;
    const noteTimestamp = noteDate ? new Date(noteDate).getTime() : 0;

    items.push({
      label: note.title,
      description: `${CLOUD_SESSION_BADGE} ${providerName}`,
      detail: noteDate ? `Date: ${new Date(noteDate).toLocaleString()}` : undefined,
      target: { kind: 'cloud', note, providerId: note.source || 'ai-session' },
      timestamp: noteTimestamp,
    });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

export function resolveHandoffSessionPayload(
  previousSession: HandoffSessionTarget,
  formatSessionMarkdown: (session: AiSession) => string,
): ResolvedHandoffPayload {
  const isRemoteNote = 'noteId' in previousSession && Boolean(previousSession.noteId);
  const providerId = previousSession.providerId || 'unknown';
  const title = previousSession.title;
  const projectSlug = previousSession.projectSlug;
  const timestamp = String(previousSession.timestamp || '');

  const payload = isRemoteNote
    ? {
        noteId: previousSession.noteId,
        provider: providerId,
        projectSlug,
        rawText: previousSession.rawText,
      }
    : {
        rawText: formatSessionMarkdown(previousSession as AiSession),
        provider: (previousSession as AiSession).providerId,
        projectSlug: (previousSession as AiSession).projectSlug,
      };

  return { payload, providerId, title, projectSlug, timestamp };
}

export interface UnifiedSessionQuickPickItem extends vscode.QuickPickItem {
  target: HandoffQuickPickTarget;
  session?: AiSession;
  timestamp: number;
  isLoadMore?: boolean;
}

export function pickBestCandidateSession(
  localCandidate: AiSession | null,
  cloudCandidate: HandoffSessionTarget | null,
): HandoffSessionTarget | null {
  if (!localCandidate) return cloudCandidate;
  if (!cloudCandidate) return localCandidate;

  const localTime = localCandidate.timestamp || 0;
  const cloudTime = typeof cloudCandidate.timestamp === 'number'
    ? cloudCandidate.timestamp
    : (cloudCandidate.timestamp ? new Date(cloudCandidate.timestamp).getTime() : 0);

  // If local has the same sessionId as cloud, favor local because it contains full turns
  if ('sessionId' in cloudCandidate && cloudCandidate.sessionId === localCandidate.sessionId) {
    return localCandidate;
  }

  return cloudTime > localTime ? cloudCandidate : localCandidate;
}

export function buildUnifiedSessionQuickPickItems(
  localSessions: AiSession[],
  cloudNotes: KbNote[],
  providers: Map<string, AiHistoryProvider>,
): UnifiedSessionQuickPickItem[] {
  const items: UnifiedSessionQuickPickItem[] = [];
  const localSessionIds = new Set<string>();

  for (const session of localSessions) {
    if (session.sessionId) {
      localSessionIds.add(session.sessionId);
    }
    const providerName = providers.get(session.providerId)?.name || session.providerId;
    const tokHint = session.tokenUsage ? ` • ${session.tokenUsage.totalTokens.toLocaleString()} tok` : '';
    items.push({
      label: session.title,
      description: providerName,
      detail: `Modified: ${new Date(session.timestamp).toLocaleString()} • ${session.turns.length} turn(s)${tokHint}`,
      target: { kind: 'local', session },
      session,
      timestamp: session.timestamp,
    });
  }

  const seenRemoteKeys = new Set<string>();
  for (const note of cloudNotes) {
    if (!isAiSessionNote(note)) continue;
    if (note.sessionId && localSessionIds.has(note.sessionId)) continue;

    const remoteKey = note.sessionId || note.id;
    if (seenRemoteKeys.has(remoteKey)) continue;
    seenRemoteKeys.add(remoteKey);

    const providerName = formatProviderDisplayName(note.source, providers);
    const noteDate = note.createdAt || note.date || note.updatedAt;
    const noteTimestamp = noteDate ? new Date(noteDate).getTime() : 0;

    items.push({
      label: note.title,
      description: `${CLOUD_SESSION_BADGE} ${providerName}`,
      detail: noteDate ? `Date: ${new Date(noteDate).toLocaleString()}` : undefined,
      target: { kind: 'cloud', note, providerId: note.source || 'ai-session' },
      timestamp: noteTimestamp,
    });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

export function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}
