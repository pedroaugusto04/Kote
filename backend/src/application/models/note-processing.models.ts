import type { AiSessionSynthesisJobStatus } from '../constants/ai-session-synthesis.constants.js';

export type AiSessionSynthesisJob = {
  id: string;
  noteId: string;
  userId: string;
  workspaceSlug: string;
  sourceHash: string;
  status: AiSessionSynthesisJobStatus;
  attempts: number;
  availableAt: string;
  leaseUntil: string | null;
  publishedAt: string | null;
  chargedAt: string | null;
  errorCode: string | null;
};
