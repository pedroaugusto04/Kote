import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';

@Injectable()
export class GetAskConversationTurnsUseCase {
  constructor(private readonly askHistoryRepository: AskHistoryRepository) {}

  execute(conversationId: string) {
    return this.askHistoryRepository.getConversationTurns(conversationId);
  }
}
