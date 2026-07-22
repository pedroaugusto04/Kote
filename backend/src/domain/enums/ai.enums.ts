export enum AiProvider {
  OpenRouter = 'openrouter',
  OpenAi = 'openai',
  Gemini = 'gemini',
  Ollama = 'ollama',
  None = 'none',
}

export enum FileNotesSummaryFallbackReason {
  FeatureDisabled = 'feature_disabled',
  QuotaExceeded = 'quota_exceeded',
  GenerationFailed = 'generation_failed',
}

export enum ConversationConfidence {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum EmbeddingTaskType {
  Document = 'document',
  Query = 'query',
}
