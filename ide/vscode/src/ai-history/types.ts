import * as vscode from 'vscode';

export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface AiSession {
  providerId: string;
  sessionId: string;
  title: string;
  turns: AiTurn[];
  timestamp: number;
  projectSlug?: string;
}

export interface AiHistoryProvider {
  id: string;
  name: string;
  isEnabled(): Promise<boolean>;
  getRecentSessions(): Promise<AiSession[]>;
  watchSessions(callback: (session: AiSession) => void): vscode.Disposable;
}
