import { Injectable } from '@nestjs/common';

import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import { AppLogger } from '../../observability/logger.js';
import {
  IngestAgentGateway,
  type IngestAgentRequest,
} from '../../application/ports/conversation/ingest-agent.gateway.js';
import type { AgentTool } from '../../contracts/agent-tool.js';
import {
  conversationAgentDecisionSchema,
  type ConversationAgentDecision,
} from '../../contracts/agent-conversation.js';
import {
  buildIngestAgentSystemPrompt,
  parseIngestAgentFinalResponse,
} from './prompts/ingest-agent.prompt.js';
import { runGeminiLoop } from './gemini-function-calling.js';
import { runOpenAiLoop } from './openai-tool-calling.js';
import type { RuntimeEnvironment } from '../../application/ports/observability/runtime-environment.port.js';

@Injectable()
export class DefaultIngestAgentGateway extends IngestAgentGateway {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async decide(
    config: Pick<RuntimeEnvironment, 'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'>,
    request: IngestAgentRequest,
    tools: AgentTool[],
  ): Promise<ConversationAgentDecision | null> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel
    ) {
      return null;
    }

    const systemPrompt = buildIngestAgentSystemPrompt({
      workspaceSlug: request.workspaceSlug,
      candidateProjectSlug: request.candidateProjectSlug,
      timeZone: request.timeZone,
      timeZoneOffset: request.timeZoneOffset,
      currentLocalDate: request.currentLocalDate,
      currentLocalTime: request.currentLocalTime,
      recentTurns: request.recentTurns,
      pendingClarification: request.pendingClarification,
    });

    const fallbackDecision = (): ConversationAgentDecision =>
      conversationAgentDecisionSchema.parse({
        replyText: 'Reached maximum reasoning steps while organizing the note.',
        action: 'clarify',
        confidence: ConversationConfidence.Low,
        resolvedDraft: {
          rawText: request.messageText,
          title: 'Captured Note',
        },
      });

    const retryOptions = {
      onRetry: (info: { attempt: number; delayMs: number; status?: number; error?: unknown }) => {
        this.logger.warn('ingest_agent.request_retry', {
          provider: config.conversationAiProvider,
          model: config.conversationAiModel,
          attempt: info.attempt,
          delayMs: info.delayMs,
          status: info.status,
          error: info.error instanceof Error ? info.error.message : info.error ? String(info.error) : undefined,
        });
      },
    };

    const history = request.recentTurns?.map((turn) => ({
      question: turn.userMessage,
      answer: turn.agentReply,
      projectSlug: request.candidateProjectSlug || '',
      timestamp: '',
    }));

    try {
      if (config.conversationAiProvider === AiProvider.Gemini) {
        return await runGeminiLoop(
          {
            baseUrl: config.conversationAiBaseUrl,
            model: config.conversationAiModel,
            apiKey: config.conversationAiApiKey,
            retryOptions,
          },
          systemPrompt,
          request.messageText,
          tools,
          parseIngestAgentFinalResponse,
          fallbackDecision,
          history,
        );
      }

      return await runOpenAiLoop(
        {
          provider: config.conversationAiProvider,
          baseUrl: config.conversationAiBaseUrl,
          model: config.conversationAiModel,
          apiKey: config.conversationAiApiKey,
          retryOptions,
        },
        systemPrompt,
        request.messageText,
        tools,
        parseIngestAgentFinalResponse,
        fallbackDecision,
        history,
      );
    } catch (error) {
      this.logger.error('ingest_agent.gateway_error', {
        cause: error instanceof Error ? error.message : String(error),
        provider: config.conversationAiProvider,
        model: config.conversationAiModel,
      });
      return null;
    }
  }
}
