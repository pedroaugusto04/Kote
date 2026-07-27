import { Injectable } from '@nestjs/common';

import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import type { AskConversationTurn } from '../../contracts/ask-conversation.js';
import {
  AnswerGenerationGateway,
  type AnswerGenerationConfig,
  type AnswerGenerationRequest,
  type AnswerGenerationResponse,
  type PrContextAiConfig,
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
import {
  buildPrReviewPrompt,
  buildPrReviewSystemPrompt,
} from './prompts/pr-review.prompt.js';

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
        confidence: ConversationConfidence.Medium,
        requestedAttachments: false,
        sources: [],
      };
    }
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

  async generatePullRequestComment(
    config: PrContextAiConfig,
    payload: {
      prTitle: string;
      prDescription: string;
      changedFiles: Array<{ filename: string; status: string; patch: string }>;
      context: AnswerContextChunk[];
    },
  ): Promise<string | null> {
    if (config.provider === 'none' || !config.apiKey || !config.model) {
      return null;
    }

    const systemPrompt = buildPrReviewSystemPrompt();
    const userContent = buildPrReviewPrompt(payload);

    try {
      const content = await runChatCompletion(
        {
          provider: config.provider as AiProvider,
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          responseFormat: { type: 'text' },
        },
        systemPrompt,
        userContent,
      );
      return content || null;
    } catch {
      return null;
    }
  }
}
