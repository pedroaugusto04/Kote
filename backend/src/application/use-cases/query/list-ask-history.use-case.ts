import { Injectable } from '@nestjs/common';

import type { PaginationInput } from '../../../contracts/pagination.js';
import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';

@Injectable()
export class ListAskHistoryUseCase {
  constructor(private readonly askHistoryRepository: AskHistoryRepository) {}

  execute(userId: string, input: PaginationInput & { projectSlug?: string }) {
    return this.askHistoryRepository.list({
      userId,
      projectSlug: input.projectSlug || '',
      page: input.page,
      pageSize: input.pageSize,
    });
  }
}
