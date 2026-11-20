import { Injectable } from '@nestjs/common';

import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import { extractJsonObject, cleanAnswerText } from '../../domain/strings.js';
import type { AskConversationTurn } from '../../contracts/ask-conversation.js';
import {
  AnswerGenerationGateway,
  type AnswerGenerationConfig,
  type AnswerGenerationRequest,
  type AnswerGenerationResponse,
  type AnswerContextChunk,
} from '../../application/ports/query/answer-generation.gateway.js';
import { runChatCompletion } from './openai-compatible-chat.js';
import {
  buildAnswerGenerationPrompt,
  buildAnswerGenerationSystemPrompt,
  parseAnswerGenerationResponse,
} from './prompts/answer-generation.prompt.js';
import {
  buildQueryRewritingPrompt,
  buildQueryRewritingSystemPrompt,
} from './prompts/query-rewriting.prompt.js';

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

    const parsedJson = extractJsonObject(content);
    if (parsedJson) {
      try {
        const response = parseAnswerGenerationResponse(parsedJson, payload.context);
        return {
          ...response,
          answer: cleanAnswerText(response.answer),
        };
      } catch {
        // Fall back to clean raw content if structured parsing fails
      }
    }

    return {
      answer: cleanAnswerText(content),
      confidence: ConversationConfidence.Medium,
      requestedAttachments: false,
      sources: [],
    };
  }

  async rewriteQuery(
    config: AnswerGenerationConfig,
    question: string,
    history: AskConversationTurn[],
  ): Promise<string> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel ||
      history.length === 0
    ) {
      return question;
    }

    const chatConfig = {
      provider: config.conversationAiProvider,
      baseUrl: config.conversationAiBaseUrl,
      model: config.conversationAiModel,
      apiKey: config.conversationAiApiKey,
    };

    const systemPrompt = buildQueryRewritingSystemPrompt();
    const userContent = buildQueryRewritingPrompt(question, history);

    try {
      const content = await runChatCompletion(chatConfig, systemPrompt, userContent);
      if (!content) return question;
      const parsed = JSON.parse(content);
      return String(parsed.rewrittenQuery || question).trim();
    } catch {
      return question;
    }
  }
}
