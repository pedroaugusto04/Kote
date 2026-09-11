import type * as vscode from 'vscode';
import type { AiProviderId, AiRole } from './constants';

export interface AiTurn {
  role: AiRole;
  content: string;
  timestamp?: number;
}

export interface AiSessionAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface AiSession {
  providerId: AiProviderId;
  sessionId: string;
  title: string;
  turns: AiTurn[];
  timestamp: number;
  timestampIsInternal: boolean;
  projectSlug?: string;
  attachments?: AiSessionAttachment[];
}

export interface AiHistoryProvider {
  readonly id: AiProviderId;
  readonly name: string;
  isEnabled(): Promise<boolean>;
  getRecentSessions(limit?: number): Promise<AiSession[]>;
  watchSessions(callback: (session: AiSession) => void): vscode.Disposable;
  /**
   * Returns the latest modification timestamp (ms) of the provider's session
   * source (directory or database file). Used by the poll loop to skip a full
   * scan when the source has not changed since the previous check.
   *
   * Returning 0 disables the optimisation for this provider (always scans).
   */
  getSourceMtime?(): number;
}
