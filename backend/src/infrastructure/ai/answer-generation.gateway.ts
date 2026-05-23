import { Injectable } from '@nestjs/common';

import { AiProvider } from '../../contracts/enums.js';
import {
  AnswerGenerationGateway,
  type AnswerGenerationConfig,
  type AnswerGenerationRequest,
  type AnswerGenerationResponse,
} from '../../application/ports/answer-generation.gateway.js';
import { runChatCompletion } from './openai-compatible-chat.js';
import {
  buildAnswerGenerationPrompt,
  buildAnswerGenerationSystemPrompt,
  parseAnswerGenerationResponse,
} from './prompts/answer-generation.prompt.js';

@Injectable()
export class DefaultAnswerGenerationGateway extends AnswerGenerationGateway {
  async generate(
    config: AnswerGenerationConfig,
    payload: AnswerGenerationRequest,
  ): Promise<AnswerGenerationResponse | null> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel
    ) {
      return null;
    }

    const chatConfig = {
      provider: config.conversationAiProvider,
      baseUrl: config.conversationAiBaseUrl,
      model: config.conversationAiModel,
      apiKey: config.conversationAiApiKey,
    };

    const systemPrompt = buildAnswerGenerationSystemPrompt();
    const userContent = buildAnswerGenerationPrompt(payload);

    const content = await runChatCompletion(chatConfig, systemPrompt, userContent);
    if (!content) return null;

    try {
      const parsedJson = JSON.parse(content);
      return parseAnswerGenerationResponse(parsedJson, payload.context);
    } catch {
      // Fallback: If parsing fails, treat the response text as the answer itself
      return {
        answer: content,
        confidence: 'medium',
        sources: [],
      };
    }
  }
}
