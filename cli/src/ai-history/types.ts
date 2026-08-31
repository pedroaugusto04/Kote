import type { AiProviderId, AiRole } from './constants.js';

export interface AiTurn {
  role: AiRole;
  content: string;
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
  projectSlug?: string;
  attachments?: AiSessionAttachment[];
}

export interface AiHistoryProvider {
  readonly id: AiProviderId;
  readonly name: string;
  getRecentSessions(limit?: number): Promise<AiSession[]>;
}
