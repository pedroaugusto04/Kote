import { Injectable } from '@nestjs/common';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { AI_SESSION_SYNTHESIS_PROCESSING } from '../../constants/ai-session-synthesis.constants.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import { AiSessionSynthesisOutboxRepository } from '../../ports/notes/ai-session-synthesis-outbox.repository.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { getAiSessionSourceHash } from './ai-session-synthesis-transcript.service.js';

@Injectable()
export class AiSessionSynthesisScheduler {
  constructor(
    private readonly syntheses: NoteSynthesisRepository,
    private readonly outbox: AiSessionSynthesisOutboxRepository,
    private readonly logger: AppLogger,
  ) {}

  async scheduleAfterInactivity(input: { userId: string; note: NoteRecord; previousNote: NoteRecord | null; tx?: any }): Promise<void> {
    const { userId, note, previousNote, tx } = input;
    if (!this.isAiSession(note) || !this.hasTranscriptChanged(previousNote, note)) return;

    const existing = await this.syntheses.getByNoteId(userId, note.id);
    if (this.hasGeneratedSynthesis(existing)) return;

    const sourceHash = this.sourceHash(note);
    const idleDelayMs = this.getIdleDelayMs();
    const availableAt = new Date(Date.now() + idleDelayMs);
    await this.syntheses.upsertPending({ userId, noteId: note.id, sourceHash }, tx);
    await this.outbox.enqueue({ userId, noteId: note.id, workspaceSlug: note.workspaceSlug || '', sourceHash, availableAt }, tx);
    this.logger.info('ai_session_synthesis.scheduled_after_inactivity', {
      userId, noteId: note.id, workspaceSlug: note.workspaceSlug || '', idleDelayMs, availableAt: availableAt.toISOString(),
    });
  }

  async scheduleImmediately(userId: string, note: NoteRecord) {
    const sourceHash = this.sourceHash(note);
    await this.syntheses.upsertPending({ userId, noteId: note.id, sourceHash, force: true });
    return this.outbox.enqueue({ userId, noteId: note.id, workspaceSlug: note.workspaceSlug || '', sourceHash, availableAt: new Date(), force: true });
  }

  private sourceHash(note: NoteRecord): string { return getAiSessionSourceHash(note.markdown); }
  private isAiSession(note: NoteRecord): boolean { return note.sourceChannel === SourceChannel.AiChat || note.source === SourceChannel.AiChat; }
  private hasTranscriptChanged(previousNote: NoteRecord | null, note: NoteRecord): boolean { return !previousNote || !this.isAiSession(previousNote) || this.sourceHash(previousNote) !== this.sourceHash(note); }
  private hasGeneratedSynthesis(synthesis: Awaited<ReturnType<NoteSynthesisRepository['getByNoteId']>>): boolean { return Boolean(synthesis?.generatedAt && synthesis.overview.trim()); }
  private getIdleDelayMs(): number {
    const configured = Number(process.env.KB_AI_SESSION_SYNTHESIS_IDLE_MS);
    if (!Number.isFinite(configured) || configured <= 0) return AI_SESSION_SYNTHESIS_PROCESSING.idleDelayDefaultMs;
    return Math.max(AI_SESSION_SYNTHESIS_PROCESSING.idleDelayMinimumMs, configured);
  }
}
