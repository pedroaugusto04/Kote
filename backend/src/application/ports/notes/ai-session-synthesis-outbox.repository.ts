import type { AiSessionSynthesisJob } from '../../models/note-processing.models.js';
import type { AiSessionSynthesisTerminalJobStatus } from '../../constants/ai-session-synthesis.constants.js';

export abstract class AiSessionSynthesisOutboxRepository {
  abstract enqueue(input: { noteId: string; userId: string; workspaceSlug: string; sourceHash: string; availableAt?: Date; force?: boolean }, tx?: any): Promise<AiSessionSynthesisJob>;
  abstract listReadyForPublish(limit?: number): Promise<AiSessionSynthesisJob[]>;
  abstract markPublished(id: string): Promise<void>;
  abstract claim(id: string, leaseMs: number): Promise<AiSessionSynthesisJob | null>;
  abstract complete(id: string, status: AiSessionSynthesisTerminalJobStatus, errorCode?: string): Promise<void>;
  abstract retry(id: string, delayMs: number, errorCode: string): Promise<void>;
  /** Returns true exactly once for a job version. */
  abstract markCharged(id: string): Promise<boolean>;
}
