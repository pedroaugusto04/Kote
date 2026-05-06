import { Injectable } from '@nestjs/common';

import { extractConversationFields } from '../../adapters/ai.js';
import {
  ConversationExtractionGateway,
  type ConversationExtraction,
  type ConversationExtractionConfig,
} from '../../application/ports/conversation-extraction.port.js';

@Injectable()
export class DefaultConversationExtractionGateway extends ConversationExtractionGateway {
  extract(
    config: ConversationExtractionConfig,
    payload: { messageText: string; projectSlugs: string[] },
  ): Promise<ConversationExtraction | null> {
    return extractConversationFields(config, payload);
  }
}
