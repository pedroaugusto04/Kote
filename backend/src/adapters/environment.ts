import { AiProvider } from '../contracts/enums.js';
import { normalizeTimeZone } from '../domain/time.js';

export const defaultGithubAppCallbackPath = '/api/integrations/github-app/callback';
export const defaultReminderTimeZone = 'America/Sao_Paulo';

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

export type RuntimeEnvironment = {
  reminderTimeZone: string;
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
  githubAppId: string;
  githubAppPrivateKey: string;
  publicBaseUrl: string;
  apiPublicBaseUrl: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  githubPushWebhookPath: string;
  ingestWebhookPath: string;
  whatsappWebhookPath: string;
  queryWebhookPath: string;
  githubAppInstallUrl: string;
  githubAppCallbackPath: string;
  telegramBotToken: string;
  telegramWebhookToken: string;
  telegramChatId: string;
  whatsappWebhookApiKey: string;
  evolutionApiKey: string;
  evolutionApiUrl: string;
  evolutionApiPublicUrl: string;
  evolutionInstanceName: string;
  databaseUrl: string;
  databaseSslMode: string;
  databaseSslRejectUnauthorized: boolean | null;
  adminEmail: string;
  adminPassword: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  googleOAuthClientId: string;
  googleOAuthClientSecret: string;
  googleOAuthRedirectUri: string;
  credentialsEncryptionKey: string;
  internalServiceToken: string;
};

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
    githubAppId: String(env.KB_GITHUB_APP_ID || '').trim(),
    githubAppPrivateKey: String(env.KB_GITHUB_APP_PRIVATE_KEY || '').trim(),
    publicBaseUrl: String(env.KB_PUBLIC_BASE_URL || env.WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    apiPublicBaseUrl: String(env.KB_API_PUBLIC_BASE_URL || '').trim().replace(/\/$/, ''),
    allowedOrigins: String(env.KB_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: String(env.KB_TRUST_PROXY || 'false').toLowerCase() === 'true',
    githubPushWebhookPath: String(env.KB_GITHUB_WEBHOOK_PATH || '/n8n/webhook/kb-github-push').trim(),
    ingestWebhookPath: String(env.KB_INGEST_WEBHOOK_PATH || '/n8n/webhook/kb-event').trim(),
    whatsappWebhookPath: String(env.KB_WPP_WEBHOOK_PATH || '/api/webhooks/whatsapp').trim(),
    queryWebhookPath: String(env.KB_QUERY_WEBHOOK_PATH || '/n8n/webhook/kb-query').trim(),
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
    jwtAccessSecret: String(env.KB_JWT_ACCESS_SECRET || '').trim(),
    jwtRefreshSecret: String(env.KB_JWT_REFRESH_SECRET || '').trim(),
    accessTokenTtlSeconds: Number(env.KB_ACCESS_TOKEN_TTL_SECONDS || 15 * 60),
    refreshTokenTtlSeconds: Number(env.KB_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 60 * 60),
    googleOAuthClientId: String(env.KB_GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    googleOAuthClientSecret: String(env.KB_GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    googleOAuthRedirectUri: String(env.KB_GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
    credentialsEncryptionKey: String(env.KB_CREDENTIALS_ENCRYPTION_KEY || '').trim(),
    internalServiceToken: String(env.KB_INTERNAL_SERVICE_TOKEN || '').trim(),
  };
}
