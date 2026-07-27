import { Injectable } from '@nestjs/common';

import type { PaginationInput } from '../../../contracts/pagination.js';
import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';

@Injectable()
export class ListAskConversationsUseCase {
  constructor(private readonly askHistoryRepository: AskHistoryRepository) {}

  execute(userId: string, input: PaginationInput & { projectId?: string }) {
    return this.askHistoryRepository.listConversations({
      userId,
      projectId: input.projectId,
      page: input.page,
      pageSize: input.pageSize,
    });
  }
}
