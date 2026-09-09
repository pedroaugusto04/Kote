import crypto from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiSessionSynthesisOutboxRepository } from '../../ports/notes/ai-session-synthesis-outbox.repository.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { IntegrationProvider } from '../../../contracts/enums.js';

@Injectable()
export class RequestAiSessionSynthesisUseCase {
  constructor(
    private readonly content: ContentRepository,
    private readonly syntheses: NoteSynthesisRepository,
    private readonly outbox: AiSessionSynthesisOutboxRepository,
    private readonly logger: AppLogger,
    private readonly entitlement: AiEntitlementService,
  ) {}

  async execute(userId: string, noteId: string) {
    const note = await this.content.getNoteById(userId, noteId);
    if (!note) throw new NotFoundException('note_not_found');
    if (note.sourceChannel !== SourceChannel.AiChat && note.source !== SourceChannel.AiChat) {
      throw new BadRequestException('note_not_ai_session');
    }
    if (!await this.entitlement.isEnabled(userId, note.workspaceSlug || '', IntegrationProvider.AiSessionSynthesis)) {
      this.logger.warn('ai_session_synthesis.manual_request_rejected', { userId, noteId, reason: 'integration_disabled' });
      throw new BadRequestException('ai_session_synthesis_not_connected');
    }

    const sourceHash = crypto.createHash('sha256').update(note.markdown || '').digest('hex');
    const availableAt = new Date();
    await this.syntheses.upsertPending({ userId, noteId, sourceHash, force: true });
    const job = await this.outbox.enqueue({
      userId,
      noteId,
      workspaceSlug: note.workspaceSlug || '',
      sourceHash,
      availableAt,
      force: true,
    });

    this.logger.info('ai_session_synthesis.manually_requested', {
      userId,
      noteId,
      jobId: job.id,
    });
    return { ok: true as const, availableAt: job.availableAt, sourceHash };
  }
}
