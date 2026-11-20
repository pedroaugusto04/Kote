import { Injectable } from '@nestjs/common';

import { AiProvider } from '../../contracts/enums.js';
import { AppLogger } from '../../observability/logger.js';
import type { AgentTool } from '../../contracts/agent-tool.js';
import type { PrReviewAgentDecision } from '../../contracts/pr-review-agent.js';
import {
  PrReviewAgentGateway,
  type PrReviewAgentConfig,
  type PrReviewAgentRequest,
} from '../../application/ports/integrations/pr-review-agent.gateway.js';
import { runGeminiLoop } from './gemini-function-calling.js';
import { runOpenAiLoop } from './openai-tool-calling.js';
import {
  buildPrReviewAgentSystemPrompt,
  buildPrReviewAgentUserMessage,
  parsePrReviewAgentFinalResponse,
} from './prompts/pr-review-agent.prompt.js';

@Injectable()
export class DefaultPrReviewAgentGateway extends PrReviewAgentGateway {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async run(
    config: PrReviewAgentConfig,
    request: PrReviewAgentRequest,
    tools: AgentTool[],
  ): Promise<PrReviewAgentDecision | null> {
    if (config.provider === 'none' || !config.apiKey || !config.model) {
      return null;
    }

    const systemPrompt = buildPrReviewAgentSystemPrompt();
    const userMessage = buildPrReviewAgentUserMessage(request);

    const fallbackDecision = (): PrReviewAgentDecision => ({
      summary: 'Automated PR analysis concluded with no critical issues identified.',
      insights: [],
      overallAssessment: {
        riskLevel: 'Low',
        suggestedAction: 'Approve',
      },
      hasMeaningfulInsights: false,
    });

    const retryOptions = {
      onRetry: (info: { attempt: number; delayMs: number; status?: number; error?: unknown }) => {
        this.logger.warn('pr_review_agent.request_retry', {
          provider: config.provider,
          model: config.model,
          attempt: info.attempt,
          delayMs: info.delayMs,
          status: info.status,
          error: info.error instanceof Error ? info.error.message : info.error ? String(info.error) : undefined,
        });
      },
    };

    this.logger.info('pr_review_agent.loop_start', {
      repository: request.repoFullName,
      prNumber: request.prNumber,
      provider: config.provider,
      model: config.model,
      availableTools: tools.map((t) => t.name),
    });

    try {
      let result: PrReviewAgentDecision;
      if (config.provider === AiProvider.Gemini) {
        result = await runGeminiLoop(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
            maxTurns: config.maxTurns ?? 5,
            retryOptions,
          },
          systemPrompt,
          userMessage,
          tools,
          parsePrReviewAgentFinalResponse,
          fallbackDecision,
        );
      } else {
        result = await runOpenAiLoop(
          {
            provider: config.provider as AiProvider,
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
            maxTurns: config.maxTurns ?? 5,
            retryOptions,
          },
          systemPrompt,
          userMessage,
          tools,
          parsePrReviewAgentFinalResponse,
          fallbackDecision,
        );
      }

      this.logger.info('pr_review_agent.loop_end', {
        repository: request.repoFullName,
        prNumber: request.prNumber,
        hasMeaningfulInsights: result?.hasMeaningfulInsights,
        insightsCount: result?.insights?.length || 0,
        riskLevel: result?.overallAssessment?.riskLevel,
      });

      return result;
    } catch (error) {
      this.logger.error('pr_review_agent.gateway_error', {
        cause: error instanceof Error ? error.message : String(error),
        provider: config.provider,
        model: config.model,
      });
      return null;
    }
  }
}
