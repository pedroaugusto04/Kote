import { AiProvider } from '../../../contracts/enums.js';
import type { RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import type { RagConfig } from '../../services/query/rag-retrieval.service.js';
import type { AnswerGenerationConfig } from '../../ports/query/answer-generation.gateway.js';

export const AI_UNAVAILABLE_FALLBACK_ANSWER =
  'I am unable to generate an answer at the moment because the AI service is temporarily unavailable or encountered an issue. Please check your AI provider configuration or try again in a few moments.';

export function resolveRagConfig(env: Partial<RuntimeEnvironment>): RagConfig {
  return {
    candidateLimit: env.ragCandidateLimit ?? 16,
    minSimilarity: env.ragMinSimilarity ?? 0.45,
    hybridVectorWeight: env.ragHybridVectorWeight ?? 0.7,
    hybridKeywordWeight: env.ragHybridKeywordWeight ?? 0.3,
    topChunksLimit: env.ragTopChunksLimit ?? 10,
    rrfK: env.ragRrfK ?? 20,
    recencyBonusEnabled: env.ragRecencyBonusEnabled ?? true,
    recencyMaxBonus: env.ragRecencyMaxBonus ?? 0.008,
    recencyMaxBonusDays: env.ragRecencyMaxBonusDays ?? 180,
  };
}

export function resolveEmbeddingConfig(env: Partial<RuntimeEnvironment>): EmbeddingConfig {
  return {
    provider: env.embeddingAiProvider || AiProvider.None,
    baseUrl: env.embeddingAiBaseUrl || '',
    model: env.embeddingAiModel || '',
    apiKey: env.embeddingAiApiKey || '',
  };
}

export function resolveConversationAiConfig(env: Partial<RuntimeEnvironment>): AnswerGenerationConfig {
  return {
    conversationAiProvider: env.conversationAiProvider || AiProvider.None,
    conversationAiBaseUrl: env.conversationAiBaseUrl || '',
    conversationAiModel: env.conversationAiModel || '',
    conversationAiApiKey: env.conversationAiApiKey || '',
  };
}
