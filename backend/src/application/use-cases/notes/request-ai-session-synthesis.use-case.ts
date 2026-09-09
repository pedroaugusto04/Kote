import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiSessionSynthesisScheduler } from '../../services/content/ai-session-synthesis-scheduler.service.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { IntegrationProvider } from '../../../contracts/enums.js';

@Injectable()
export class RequestAiSessionSynthesisUseCase {
  constructor(
    private readonly content: ContentRepository,
    private readonly scheduler: AiSessionSynthesisScheduler,
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

    const job = await this.scheduler.scheduleImmediately(userId, note);

    this.logger.info('ai_session_synthesis.manually_requested', {
      userId,
      noteId,
      jobId: job.id,
    });
    return { ok: true as const, availableAt: job.availableAt, sourceHash: job.sourceHash };
  }
}
