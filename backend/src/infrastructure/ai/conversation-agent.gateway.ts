import { Injectable } from '@nestjs/common';

import { decideConversationAgentTurn } from '../../adapters/ai.js';
import { ConversationAgentGateway, type ConversationAgentRequest, type ConversationAgentResponse } from '../../application/ports/conversation/conversation-agent.gateway.js';
import type { RuntimeEnvironment } from '../../application/ports/observability/runtime-environment.port.js';

@Injectable()
export class DefaultConversationAgentGateway extends ConversationAgentGateway {
  decide(
    config: Pick<RuntimeEnvironment, 'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'>,
    payload: ConversationAgentRequest,
  ): Promise<ConversationAgentResponse | null> {
    return decideConversationAgentTurn(
      {
        provider: config.conversationAiProvider,
        baseUrl: config.conversationAiBaseUrl,
        model: config.conversationAiModel,
        apiKey: config.conversationAiApiKey,
      },
      payload,
    );
  }
}
