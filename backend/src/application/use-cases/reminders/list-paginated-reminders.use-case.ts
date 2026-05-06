import { Injectable } from '@nestjs/common';

import { buildPaginationMeta } from '../../../contracts/pagination.js';
import type { ListRemindersInput } from '../../models/reminder-list.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';

@Injectable()
export class ListPaginatedRemindersUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string, input: ListRemindersInput) {
    const reminders = (await this.contentQueryRepository.listReminders(userId))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, reminders.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reminders.slice(start, start + pagination.pageSize), pagination };
  }
}
