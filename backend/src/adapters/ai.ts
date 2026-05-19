import { AiProvider } from '../contracts/enums.js';
import { conversationAgentDecisionSchema, normalizeConversationAgentDecisionInput, type ConversationAgentDecision } from '../contracts/agent-conversation.js';
import { runChatCompletion, runStructuredChatCompletion, type ChatConfig } from '../infrastructure/ai/openai-compatible-chat.js';
import { buildConversationAgentSystemPrompt, buildConversationAgentTurnPrompt, type ConversationAgentTurnPayload } from '../infrastructure/ai/prompts/conversation-agent.prompt.js';
import { buildKnowledgeQuerySystemPrompt, parseKnowledgeAnswer, type KnowledgeAnswer, type KnowledgeQueryPromptPayload } from '../infrastructure/ai/prompts/knowledge-query.prompt.js';
import { buildReviewAnalysisSystemPrompt, parseReviewAnalysis, reviewAnalysisFallback, type ReviewAnalysis } from '../infrastructure/ai/prompts/review-analysis.prompt.js';

export type { ChatConfig, ConversationAgentTurnPayload, KnowledgeAnswer, ReviewAnalysis };

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

export async function answerKnowledgeQuery(
  config: ChatConfig,
  payload: KnowledgeQueryPromptPayload,
): Promise<KnowledgeAnswer | null> {
  return runStructuredChatCompletion(
    config,
    buildKnowledgeQuerySystemPrompt(),
    JSON.stringify(payload),
    parseKnowledgeAnswer,
  );
}
