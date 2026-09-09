import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiSessionSynthesisOutboxRepository } from '../../ports/notes/ai-session-synthesis-outbox.repository.js';
import { AiSessionSynthesisQueuePublisher } from '../../ports/notes/ai-session-synthesis-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';
import { AI_SESSION_SYNTHESIS_PROCESSING } from '../../constants/ai-session-synthesis.constants.js';

@Injectable()
export class AiSessionSynthesisOutboxRelay implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly outbox: AiSessionSynthesisOutboxRepository, private readonly publisher: AiSessionSynthesisQueuePublisher, private readonly logger: AppLogger) {}

  async onModuleInit() {
    await this.flush();
    const interval = Math.max(
      AI_SESSION_SYNTHESIS_PROCESSING.outboxPollMinimumMs,
      Number(process.env.KB_AI_SESSION_SYNTHESIS_OUTBOX_POLL_MS || AI_SESSION_SYNTHESIS_PROCESSING.outboxPollDefaultMs),
    );
    this.timer = setInterval(() => void this.flush(), interval);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of await this.outbox.listReadyForPublish()) {
        try {
          await this.publisher.publish({ jobId: job.id });
          await this.outbox.markPublished(job.id);
          this.logger.info('ai_session_synthesis.outbox_published', { jobId: job.id, noteId: job.noteId });
        } catch (error) {
          this.logger.warn('ai_session_synthesis.outbox_publish_failed', { jobId: job.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } finally { this.running = false; }
  }
}
