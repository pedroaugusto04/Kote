import { Injectable } from '@nestjs/common';

import type { UpdateReminderStatusInput } from '../../models/reminder-board.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class UpdateReminderStatusUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, input: UpdateReminderStatusInput) {
    const updated = await this.contentRepository.updateReminderStatus(userId, input.id, input.status);
    if (!updated) return { ok: false as const, reason: 'reminder_not_found' };
    return { ok: true as const, id: input.id, status: input.status };
  }
}
