import { AiProvider } from '../contracts/enums.js';
import { conversationAgentDecisionSchema, normalizeConversationAgentDecisionInput, type ConversationAgentDecision } from '../contracts/agent-conversation.js';
import { runChatCompletion, runStructuredChatCompletion, type ChatConfig } from '../infrastructure/ai/openai-compatible-chat.js';
import { buildConversationAgentSystemPrompt, buildConversationAgentTurnPrompt, type ConversationAgentTurnPayload } from '../infrastructure/ai/prompts/conversation-agent.prompt.js';
import { buildReviewAnalysisSystemPrompt, parseReviewAnalysis, reviewAnalysisFallback, type ReviewAnalysis } from '../infrastructure/ai/prompts/review-analysis.prompt.js';
import { buildWeeklySummarySystemPrompt, parseWeeklySummary, weeklySummaryFallback } from '../infrastructure/ai/prompts/weekly-summary.prompt.js';
import { buildDependencyAlertSystemPrompt, parseDependencyAlert, dependencyAlertFallback } from '../infrastructure/ai/prompts/dependency-alert.prompt.js';
import type { WeeklySummaryAnalysis } from '../contracts/weekly-summary.js';
import type { DependencyAlertResult } from '../application/ports/dependency-watcher/dependency-alert.port.js';

export type { ChatConfig, ConversationAgentTurnPayload, ReviewAnalysis, WeeklySummaryAnalysis, DependencyAlertResult };

export async function generateReviewAnalysis(
  config: ChatConfig,
  promptPayload: unknown,
): Promise<ReviewAnalysis> {
  if (config.provider === AiProvider.None || !config.apiKey || !config.model) return reviewAnalysisFallback;

  const content = await runChatCompletion( 
    config,
    buildReviewAnalysisSystemPrompt(),
    JSON.stringify(promptPayload),
  );
  if (!content) return reviewAnalysisFallback;
  return parseReviewAnalysis(JSON.parse(content));
}

export async function decideConversationAgentTurn(
  config: ChatConfig,
  payload: ConversationAgentTurnPayload,
): Promise<ConversationAgentDecision | null> {
  return runStructuredChatCompletion(
    config,
    buildConversationAgentSystemPrompt(),
    buildConversationAgentTurnPrompt(payload),
    (parsed) => conversationAgentDecisionSchema.parse(normalizeConversationAgentDecisionInput(parsed)),
  );
}

export async function generateWeeklySummary(
  config: ChatConfig,
  promptPayload: unknown,
): Promise<WeeklySummaryAnalysis> {
  if (config.provider === AiProvider.None || !config.apiKey || !config.model) {
    throw new Error('Weekly summary AI provider is not configured');
  }

  const content = await runChatCompletion(
    config,
    buildWeeklySummarySystemPrompt(),
    JSON.stringify(promptPayload),
  );
  if (!content) {
    throw new Error('Weekly summary AI returned an empty response');
  }
  return parseWeeklySummary(JSON.parse(content));
}

export async function generateDependencyAlert(
  config: ChatConfig,
  promptPayload: unknown,
): Promise<DependencyAlertResult> {
  if (config.provider === AiProvider.None || !config.apiKey || !config.model) return dependencyAlertFallback;

  const content = await runChatCompletion(
    config,
    buildDependencyAlertSystemPrompt(),
    JSON.stringify(promptPayload),
  );
  if (!content) return dependencyAlertFallback;
  return parseDependencyAlert(JSON.parse(content));
}
