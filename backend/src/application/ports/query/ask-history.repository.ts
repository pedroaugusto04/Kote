import type { AskHistoryResult, SaveAskHistoryInput, ListAskHistoryInput } from '../../models/ask-history.models.js';

export abstract class AskHistoryRepository {
  abstract save(input: SaveAskHistoryInput): Promise<void>;
  abstract list(input: ListAskHistoryInput): Promise<AskHistoryResult>;
}
