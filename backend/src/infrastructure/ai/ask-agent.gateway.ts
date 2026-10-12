import { Injectable } from '@nestjs/common';

import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import { AppLogger } from '../../observability/logger.js';
import {
  AskAgentGateway,
  type AskAgentRequest,
  type AskAgentTool,
} from '../../application/ports/query/ask-agent.gateway.js';
import type {
  AnswerGenerationConfig,
  AnswerGenerationResponse,
} from '../../application/ports/query/answer-generation.gateway.js';
import { runGeminiAgentLoop } from './gemini-function-calling.js';
import { runOpenAiAgentLoop } from './openai-tool-calling.js';

import { buildAskAgentSystemPrompt } from './prompts/ask-agent.prompt.js';

export { buildAskAgentSystemPrompt };

@Injectable()
export class DefaultAskAgentGateway extends AskAgentGateway {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async run(
    config: AnswerGenerationConfig,
    request: AskAgentRequest,
    tools: AskAgentTool[],
  ): Promise<AnswerGenerationResponse | null> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel
    ) {
      return null;
    }

    const systemPrompt = buildAskAgentSystemPrompt();

    try {
      if (config.conversationAiProvider === AiProvider.Gemini) {
        return await runGeminiAgentLoop(
          {
            baseUrl: config.conversationAiBaseUrl,
            model: config.conversationAiModel,
            apiKey: config.conversationAiApiKey,
          },
          systemPrompt,
          request.question,
          tools,
          request.conversationHistory,
        );
      }

      return await runOpenAiAgentLoop(
        {
          provider: config.conversationAiProvider,
          baseUrl: config.conversationAiBaseUrl,
          model: config.conversationAiModel,
          apiKey: config.conversationAiApiKey,
        },
        systemPrompt,
        request.question,
        tools,
        request.conversationHistory,
      );
    } catch (error) {
      this.logger.error('ask_agent.gateway_error', {
        cause: error instanceof Error ? error.message : String(error),
        provider: config.conversationAiProvider,
        model: config.conversationAiModel,
      });
      return null;
    }
  }
}
