import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';

export interface BulkUpdateReminderStatusInput {
  userId: string;
  ids: string[];
  status: string;
}

@Injectable()
export class BulkUpdateReminderStatusUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: BulkUpdateReminderStatusInput): Promise<{ ok: true; updatedCount: number }> {
    const { userId, ids, status } = input;
    if (ids.length === 0) {
      return { ok: true as const, updatedCount: 0 };
    }
    await this.contentRepository.updateReminderStatuses(userId, ids, status);
    return { ok: true as const, updatedCount: ids.length };
  }
}
