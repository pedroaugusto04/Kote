import type { AskHistoryResult, SaveAskHistoryInput, ListAskHistoryInput, AskHistoryItem, AskConversationSummary } from '../../models/ask-history.models.js';
import type { PaginatedResult } from '../../../contracts/pagination.js';

export abstract class AskHistoryRepository {
  abstract save(input: SaveAskHistoryInput): Promise<void>;
  abstract list(input: ListAskHistoryInput): Promise<AskHistoryResult>;
  abstract listConversations(input: { userId: string; projectId?: string; page: number; pageSize: number }): Promise<PaginatedResult<AskConversationSummary>>;
  abstract getConversationTurns(conversationId: string): Promise<AskHistoryItem[]>;
}
