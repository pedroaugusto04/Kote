import { AiProvider } from '../contracts/enums.js';

export type RuntimeEnvironment = {
  webhookSecret: string;
  githubWebhookSecret: string;
  conversationTimeoutMs: number;
  reviewAiProvider: AiProvider;
  reviewAiBaseUrl: string;
  reviewAiModel: string;
  reviewAiApiKey: string;
  conversationAiProvider: AiProvider;
  conversationAiBaseUrl: string;
  conversationAiModel: string;
  conversationAiApiKey: string;
  githubApiToken: string;
  allowedGroupId: string;
  publicBaseUrl: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  githubPushWebhookPath: string;
  ingestWebhookPath: string;
  whatsappWebhookPath: string;
  onboardingWebhookPath: string;
  queryWebhookPath: string;
  githubAppInstallUrl: string;
  whatsappPairingUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  evolutionApiKey: string;
  evolutionApiUrl: string;
  evolutionApiPublicUrl: string;
  evolutionInstanceName: string;
  databaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  credentialsEncryptionKey: string;
  internalServiceToken: string;
};

export function readEnvironment(env = process.env): RuntimeEnvironment {
  return {
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
    githubApiToken: String(env.KB_GITHUB_API_TOKEN || '').trim(),
    allowedGroupId: String(env.WPP_KB_GROUP_JID || '').trim(),
    publicBaseUrl: String(env.KB_PUBLIC_BASE_URL || env.WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    allowedOrigins: String(env.KB_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: String(env.KB_TRUST_PROXY || 'false').toLowerCase() === 'true',
    githubPushWebhookPath: String(env.KB_GITHUB_WEBHOOK_PATH || '/n8n/webhook/kb-github-push').trim(),
    ingestWebhookPath: String(env.KB_INGEST_WEBHOOK_PATH || '/n8n/webhook/kb-event').trim(),
    whatsappWebhookPath: String(env.KB_WPP_WEBHOOK_PATH || '/n8n/webhook/whatsapp-kb-event').trim(),
    onboardingWebhookPath: String(env.KB_ONBOARDING_WEBHOOK_PATH || '/n8n/webhook/kb-onboarding').trim(),
    queryWebhookPath: String(env.KB_QUERY_WEBHOOK_PATH || '/n8n/webhook/kb-query').trim(),
    githubAppInstallUrl: String(env.KB_GITHUB_APP_INSTALL_URL || '').trim(),
    whatsappPairingUrl: String(env.KB_WPP_PAIRING_URL || '').trim(),
    telegramBotToken: String(env.KB_TELEGRAM_BOT_TOKEN || '').trim(),
    telegramChatId: String(env.KB_TELEGRAM_CHAT_ID || '').trim(),
    evolutionApiKey: String(env.EVOLUTION_API_KEY || '').trim(),
    evolutionApiUrl: String(env.EVOLUTION_API_URL || '').trim(),
    evolutionApiPublicUrl: String(env.EVOLUTION_API_PUBLIC_URL || '').trim(),
    evolutionInstanceName: String(env.EVOLUTION_INSTANCE_NAME || '').trim(),
    databaseUrl: String(env.KB_DATABASE_URL || '').trim(),
    adminEmail: String(env.KB_ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: String(env.KB_ADMIN_PASSWORD || '').trim(),
    jwtAccessSecret: String(env.KB_JWT_ACCESS_SECRET || '').trim(),
    jwtRefreshSecret: String(env.KB_JWT_REFRESH_SECRET || '').trim(),
    accessTokenTtlSeconds: Number(env.KB_ACCESS_TOKEN_TTL_SECONDS || 15 * 60),
    refreshTokenTtlSeconds: Number(env.KB_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 60 * 60),
    credentialsEncryptionKey: String(env.KB_CREDENTIALS_ENCRYPTION_KEY || '').trim(),
    internalServiceToken: String(env.KB_INTERNAL_SERVICE_TOKEN || '').trim(),
  };
}
