import { AiProvider } from '../contracts/enums.js';
import type { RuntimeEnvironment } from '../application/ports/observability/runtime-environment.port.js';
import { normalizeTimeZone } from '../domain/time.js';

export const defaultGithubAppCallbackPath = '/api/integrations/github-app/callback';
export const defaultReminderTimeZone = 'America/Sao_Paulo';

export function normalizeGithubBackfillLimit(value: string | undefined): number {
  const parsed = Number.parseInt(String(value ?? '5').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.min(parsed, 50);
}

export function normalizeNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseFloat(String(value).trim());
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return defaultValue;
  return parsed;
}

export function normalizeGithubAppCallbackPath(value: string | undefined): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return defaultGithubAppCallbackPath;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname || defaultGithubAppCallbackPath;
  } catch {
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
  }
}

export function readEnvironment(env = process.env): RuntimeEnvironment {
  return {
    reminderTimeZone: normalizeTimeZone(String(env.KB_REMINDER_TIMEZONE || defaultReminderTimeZone)),
    webhookSecret: String(env.KB_WEBHOOK_SECRET || '').trim(),
    githubWebhookSecret: String(env.KB_GITHUB_APP_WEBHOOK_SECRET || '').trim(),
    conversationTimeoutMs: Number(env.WPP_CONVERSATION_TIMEOUT_MS || 600_000),
    reviewAiProvider: (String(env.KB_REVIEW_AI_PROVIDER || 'openrouter').trim().toLowerCase() as RuntimeEnvironment['reviewAiProvider']),
    reviewAiBaseUrl: String(env.KB_REVIEW_AI_BASE_URL || 'https://openrouter.ai/api/v1').trim(),
    reviewAiModel: String(env.KB_REVIEW_AI_MODEL || 'openrouter/auto').trim(),
    reviewAiApiKey: String(env.KB_REVIEW_AI_API_KEY || '').trim(),
    conversationAiProvider: (String(env.KB_CONVERSATION_AI_PROVIDER || env.KB_REVIEW_AI_PROVIDER || 'openrouter').trim().toLowerCase() as RuntimeEnvironment['conversationAiProvider']),
    conversationAiBaseUrl: String(env.KB_CONVERSATION_AI_BASE_URL || env.KB_REVIEW_AI_BASE_URL || 'https://openrouter.ai/api/v1').trim(),
    conversationAiModel: String(env.KB_CONVERSATION_AI_MODEL || env.KB_REVIEW_AI_MODEL || 'openrouter/auto').trim(),
    conversationAiApiKey: String(env.KB_CONVERSATION_AI_API_KEY || env.KB_REVIEW_AI_API_KEY || '').trim(),
    projectBriefAiProvider: (String(env.KB_PROJECT_BRIEF_AI_PROVIDER || env.KB_CONVERSATION_AI_PROVIDER || env.KB_REVIEW_AI_PROVIDER || 'openrouter').trim().toLowerCase() as RuntimeEnvironment['projectBriefAiProvider']),
    projectBriefAiBaseUrl: String(env.KB_PROJECT_BRIEF_AI_BASE_URL || env.KB_CONVERSATION_AI_BASE_URL || env.KB_REVIEW_AI_BASE_URL || 'https://openrouter.ai/api/v1').trim(),
    projectBriefAiModel: String(env.KB_PROJECT_BRIEF_AI_MODEL || env.KB_CONVERSATION_AI_MODEL || env.KB_REVIEW_AI_MODEL || 'openrouter/auto').trim(),
    projectBriefAiApiKey: String(env.KB_PROJECT_BRIEF_AI_API_KEY || env.KB_CONVERSATION_AI_API_KEY || env.KB_REVIEW_AI_API_KEY || '').trim(),
    prContextAiProvider: (String(env.KB_PR_CONTEXT_AI_PROVIDER || env.KB_CONVERSATION_AI_PROVIDER || env.KB_REVIEW_AI_PROVIDER || 'openrouter').trim().toLowerCase() as RuntimeEnvironment['prContextAiProvider']),
    prContextAiBaseUrl: String(env.KB_PR_CONTEXT_AI_BASE_URL || env.KB_CONVERSATION_AI_BASE_URL || env.KB_REVIEW_AI_BASE_URL || 'https://openrouter.ai/api/v1').trim(),
    prContextAiModel: String(env.KB_PR_CONTEXT_AI_MODEL || env.KB_CONVERSATION_AI_MODEL || env.KB_REVIEW_AI_MODEL || 'openrouter/auto').trim(),
    prContextAiApiKey: String(env.KB_PR_CONTEXT_AI_API_KEY || env.KB_CONVERSATION_AI_API_KEY || env.KB_REVIEW_AI_API_KEY || '').trim(),
    embeddingAiProvider: (String(env.KB_EMBEDDING_AI_PROVIDER || 'gemini').trim().toLowerCase() as RuntimeEnvironment['embeddingAiProvider']),
    embeddingAiBaseUrl: String(env.KB_EMBEDDING_AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').trim(),
    embeddingAiModel: String(env.KB_EMBEDDING_AI_MODEL || 'gemini-embedding-001').trim(),
    embeddingAiApiKey: String(env.KB_EMBEDDING_AI_API_KEY || '').trim(),
    audioAiProvider: (String(env.KB_AUDIO_AI_PROVIDER || 'gemini').trim().toLowerCase() as RuntimeEnvironment['audioAiProvider']),
    audioAiBaseUrl: String(env.KB_AUDIO_AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').trim(),
    audioAiModel: String(env.KB_AUDIO_AI_MODEL || 'gemini-2.5-flash').trim(),
    audioAiApiKey: String(env.KB_AUDIO_AI_API_KEY || env.KB_EMBEDDING_AI_API_KEY || '').trim(),
    githubAppId: String(env.KB_GITHUB_APP_ID || '').trim(),
    githubAppPrivateKey: String(env.KB_GITHUB_APP_PRIVATE_KEY || '').trim(),
    githubBackfillLimit: normalizeGithubBackfillLimit(env.KB_GITHUB_BACKFILL_LIMIT),
    publicBaseUrl: String(env.KB_PUBLIC_BASE_URL || env.WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    apiPublicBaseUrl: String(env.KB_API_PUBLIC_BASE_URL || '').trim().replace(/\/$/, ''),
    allowedOrigins: String(env.KB_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    allowedExtensionIds: String(env.KB_ALLOWED_EXTENSION_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    trustProxy: String(env.KB_TRUST_PROXY || 'false').toLowerCase() === 'true',
    githubPushWebhookPath: String(env.KB_GITHUB_WEBHOOK_PATH || '/api/webhooks/github-push').trim(),
    ingestWebhookPath: String(env.KB_INGEST_WEBHOOK_PATH || '/api/webhooks/ingest').trim(),
    whatsappWebhookPath: String(env.KB_WPP_WEBHOOK_PATH || '/api/webhooks/whatsapp').trim(),
    queryWebhookPath: String(env.KB_QUERY_WEBHOOK_PATH || '/api/webhooks/query').trim(),
    githubAppInstallUrl: String(env.KB_GITHUB_APP_INSTALL_URL || '').trim(),
    githubAppCallbackPath: normalizeGithubAppCallbackPath(env.KB_GITHUB_APP_CALLBACK_PATH),
    telegramBotToken: String(env.KB_TELEGRAM_BOT_TOKEN || '').trim(),
    telegramWebhookToken: String(env.KB_TELEGRAM_WEBHOOK_TOKEN || env.KB_WEBHOOK_SECRET || '').trim(),
    telegramChatId: String(env.KB_TELEGRAM_CHAT_ID || '').trim(),
    whatsappWebhookApiKey: String(env.KB_WPP_WEBHOOK_API_KEY || '').trim(),
    evolutionApiKey: String(env.EVOLUTION_API_KEY || '').trim(),
    evolutionApiUrl: String(env.EVOLUTION_API_URL || '').trim(),
    evolutionApiPublicUrl: String(env.EVOLUTION_API_PUBLIC_URL || '').trim(),
    evolutionInstanceName: String(env.EVOLUTION_INSTANCE_NAME || '').trim(),
    databaseUrl: String(env.KB_DATABASE_URL || '').trim(),
    databaseSslMode: String(env.KB_DATABASE_SSL_MODE || '').trim().toLowerCase(),
    databaseSslRejectUnauthorized: String(env.KB_DATABASE_SSL_REJECT_UNAUTHORIZED || '').trim() === ''
      ? null
      : String(env.KB_DATABASE_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() === 'true',
    adminEmail: String(env.KB_ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: String(env.KB_ADMIN_PASSWORD || '').trim(),
    emailProvider: (String(env.KB_EMAIL_PROVIDER || 'resend').trim().toLowerCase() as RuntimeEnvironment['emailProvider']),
    emailResendApiKey: String(env.KB_EMAIL_RESEND_API_KEY || '').trim(),
    emailFrom: String(env.KB_EMAIL_FROM || env.KB_ADMIN_EMAIL || 'Kote <no-reply@kote.local>').trim(),
    emailSmtpHost: String(env.KB_EMAIL_SMTP_HOST || '').trim(),
    emailSmtpPort: Number(env.KB_EMAIL_SMTP_PORT || 587),
    emailSmtpUser: String(env.KB_EMAIL_SMTP_USER || '').trim(),
    emailSmtpPass: String(env.KB_EMAIL_SMTP_PASS || '').trim(),
    emailSmtpSecure: String(env.KB_EMAIL_SMTP_SECURE || 'false').trim().toLowerCase() === 'true',
    emailQueueExchange: String(env.KB_EMAIL_QUEUE_EXCHANGE || 'kb.email').trim(),
    emailQueueName: String(env.KB_EMAIL_QUEUE_NAME || 'kb.email.send').trim(),
    emailQueueRoutingKey: String(env.KB_EMAIL_QUEUE_ROUTING_KEY || 'kb.email.send').trim(),
    emailWorkerAutorun: String(env.KB_EMAIL_WORKER_AUTORUN || 'true').trim().toLowerCase() === 'true',
    devEmailIntercept: String(env.DEV_EMAIL_INTERCEPT || 'false').trim().toLowerCase() === 'true',
    devEmail: String(env.DEV_EMAIL || 'pedroaugustoaduarte@gmail.com').trim(),
    jwtAccessSecret: String(env.KB_JWT_ACCESS_SECRET || '').trim(),
    jwtRefreshSecret: String(env.KB_JWT_REFRESH_SECRET || '').trim(),
    accessTokenTtlSeconds: Number(env.KB_ACCESS_TOKEN_TTL_SECONDS || 15 * 60),
    refreshTokenTtlSeconds: Number(env.KB_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 60 * 60),
    googleOAuthClientId: String(env.KB_GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    googleOAuthClientSecret: String(env.KB_GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    googleOAuthRedirectUri: String(env.KB_GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
    credentialsEncryptionKey: String(env.KB_CREDENTIALS_ENCRYPTION_KEY || '').trim(),
    internalServiceToken: String(env.KB_INTERNAL_SERVICE_TOKEN || '').trim(),
    disableEmbeddingWorker: String(env.KB_DISABLE_EMBEDDING_WORKER || 'false').trim().toLowerCase() === 'true',
    testEmailAuthSecret: String(env.KB_TEST_EMAIL_AUTH_SECRET || '').trim(),
    searchMinSimilarity: normalizeNumber(env.KB_SEARCH_MIN_SIMILARITY, 0.3),
    searchCandidateLimitMultiplier: normalizeNumber(env.KB_SEARCH_CANDIDATE_LIMIT_MULTIPLIER, 3),
    searchHybridVectorWeight: normalizeNumber(env.KB_SEARCH_HYBRID_VECTOR_WEIGHT, 0.4),
    searchHybridKeywordWeight: normalizeNumber(env.KB_SEARCH_HYBRID_KEYWORD_WEIGHT, 0.6),
    searchRrfK: normalizeNumber(env.KB_SEARCH_RRF_K, 20),
    ragMinSimilarity: normalizeNumber(env.KB_RAG_MIN_SIMILARITY, 0.65),
    ragCandidateLimit: normalizeNumber(env.KB_RAG_CANDIDATE_LIMIT, 16),
    ragHybridVectorWeight: normalizeNumber(env.KB_RAG_HYBRID_VECTOR_WEIGHT, 0.7),
    ragHybridKeywordWeight: normalizeNumber(env.KB_RAG_HYBRID_KEYWORD_WEIGHT, 0.3),
    ragTopChunksLimit: normalizeNumber(env.KB_RAG_TOP_CHUNKS_LIMIT, 8),
    ragRrfK: normalizeNumber(env.KB_RAG_RRF_K, 20),
    attachmentMaxSizeBytes: Number(env.KB_ATTACHMENT_MAX_SIZE_BYTES || 10 * 1024 * 1024),
    avatarMaxSizeBytes: Number(env.KB_AVATAR_MAX_SIZE_BYTES || 3 * 1024 * 1024),
  };
}
