import type { CanonicalType, Importance, KnowledgeKind } from '../../contracts/enums.js';
import type { AiProvider } from '../../contracts/enums.js';

export type ConversationExtraction = {
  rawText?: string;
  projectSlug?: string;
  kind?: KnowledgeKind;
  canonicalType?: CanonicalType;
  importance?: Importance;
  tags?: string[];
  reminderDate?: string;
  reminderTime?: string;
};

export type ConversationExtractionConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export abstract class ConversationExtractionGateway {
  abstract extract(
    config: ConversationExtractionConfig,
    payload: { messageText: string; projectSlugs: string[] },
  ): Promise<ConversationExtraction | null>;
}
