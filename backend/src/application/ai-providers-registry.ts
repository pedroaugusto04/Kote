import { IntegrationProvider } from '../contracts/enums.js';
import type { RuntimeEnvironment } from './ports/observability/runtime-environment.port.js';

export type AiProviderRegistryEntry = {
  providerKey: keyof RuntimeEnvironment;
  baseUrlKey: keyof RuntimeEnvironment;
  modelKey: keyof RuntimeEnvironment;
  apiKeyKey: keyof RuntimeEnvironment;
  label: string;
  errorCode: string;
};

export const AI_PROVIDERS_REGISTRY: Record<
  | IntegrationProvider.AiReview
  | IntegrationProvider.AiConversation
  | IntegrationProvider.ProjectBriefAi
  | IntegrationProvider.PrContextAi
  | IntegrationProvider.FileNotesSummaryAi,
  AiProviderRegistryEntry
> = {
  [IntegrationProvider.AiReview]: {
    providerKey: 'reviewAiProvider',
    baseUrlKey: 'reviewAiBaseUrl',
    modelKey: 'reviewAiModel',
    apiKeyKey: 'reviewAiApiKey',
    label: 'Review AI',
    errorCode: 'review_ai_not_configured',
  },
  [IntegrationProvider.AiConversation]: {
    providerKey: 'conversationAiProvider',
    baseUrlKey: 'conversationAiBaseUrl',
    modelKey: 'conversationAiModel',
    apiKeyKey: 'conversationAiApiKey',
    label: 'Conversation AI',
    errorCode: 'conversation_ai_not_configured',
  },
  [IntegrationProvider.ProjectBriefAi]: {
    providerKey: 'projectBriefAiProvider',
    baseUrlKey: 'projectBriefAiBaseUrl',
    modelKey: 'projectBriefAiModel',
    apiKeyKey: 'projectBriefAiApiKey',
    label: 'Project Brief AI',
    errorCode: 'project_brief_ai_not_configured',
  },
  [IntegrationProvider.PrContextAi]: {
    providerKey: 'prContextAiProvider',
    baseUrlKey: 'prContextAiBaseUrl',
    modelKey: 'prContextAiModel',
    apiKeyKey: 'prContextAiApiKey',
    label: 'PR Context AI',
    errorCode: 'pr_context_ai_not_configured',
  },
  [IntegrationProvider.FileNotesSummaryAi]: {
    providerKey: 'fileNotesSummaryAiProvider',
    baseUrlKey: 'fileNotesSummaryAiBaseUrl',
    modelKey: 'fileNotesSummaryAiModel',
    apiKeyKey: 'fileNotesSummaryAiApiKey',
    label: 'File Notes Summary AI',
    errorCode: 'file_notes_summary_ai_not_configured',
  },
};

export function getAiProviderConfig(
  provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation | IntegrationProvider.ProjectBriefAi | IntegrationProvider.PrContextAi | IntegrationProvider.FileNotesSummaryAi,
  environment: RuntimeEnvironment,
) {
  const entry = AI_PROVIDERS_REGISTRY[provider];
  if (!entry) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  return {
    provider: environment[entry.providerKey] as string,
    baseUrl: environment[entry.baseUrlKey] as string,
    model: environment[entry.modelKey] as string,
    apiKey: environment[entry.apiKeyKey] as string,
    label: entry.label,
    errorCode: entry.errorCode,
  };
}
