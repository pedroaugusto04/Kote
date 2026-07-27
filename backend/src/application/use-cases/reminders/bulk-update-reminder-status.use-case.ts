import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class BulkUpdateReminderStatusUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, ids: string[], status: string) {
    if (ids.length === 0) {
      return { ok: true as const, updatedCount: 0 };
    }
    await this.contentRepository.updateReminderStatuses(userId, ids, status);
    return { ok: true as const, updatedCount: ids.length };
  }
}
