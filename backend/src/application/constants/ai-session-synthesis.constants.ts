export const AiSessionSynthesisJobStatus = {
  Pending: 'pending',
  Published: 'published',
  Processing: 'processing',
  Completed: 'completed',
  Failed: 'failed',
  Skipped: 'skipped',
  Superseded: 'superseded',
} as const;

export type AiSessionSynthesisJobStatus = typeof AiSessionSynthesisJobStatus[keyof typeof AiSessionSynthesisJobStatus];
export type AiSessionSynthesisTerminalJobStatus = Extract<AiSessionSynthesisJobStatus,
  typeof AiSessionSynthesisJobStatus.Completed
  | typeof AiSessionSynthesisJobStatus.Failed
  | typeof AiSessionSynthesisJobStatus.Skipped
  | typeof AiSessionSynthesisJobStatus.Superseded>;

export const AiSessionSynthesisErrorCode = {
  EmptyTranscript: 'empty_transcript',
  IntegrationDisabled: 'integration_disabled',
  QuotaExceeded: 'quota_exceeded',
  GenerationFailed: 'generation_failed',
} as const;

export const NoteSynthesisStatus = {
  Pending: 'pending',
  Processing: 'processing',
  Completed: 'completed',
  Failed: 'failed',
  Skipped: 'skipped',
} as const;

export type NoteSynthesisStatus = typeof NoteSynthesisStatus[keyof typeof NoteSynthesisStatus];

export const AI_SESSION_SYNTHESIS_QUEUE = {
  exchange: 'kb.ai-session-synthesis',
  queue: 'kb.ai-session-synthesis.jobs',
  routingKey: 'ai-session-synthesis',
  deadLetterExchange: 'kb.ai-session-synthesis.dlx',
  deadLetterQueue: 'kb.ai-session-synthesis.jobs.dlq',
} as const;

export const AI_SESSION_SYNTHESIS_PROCESSING = {
  concurrency: 2,
  leaseMs: 10 * 60_000,
  idleDelayDefaultMs: 24 * 60 * 60_000,
  idleDelayMinimumMs: 60_000,
  reconnectDelayMs: 5_000,
  retryDelaysMs: [60_000, 5 * 60_000, 15 * 60_000],
  deterministicMaxTranscriptChars: 1_200,
  deterministicExcerptChars: 800,
  outboxPollDefaultMs: 5_000,
  outboxPollMinimumMs: 250,
} as const;
