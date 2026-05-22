import type { AiProvider } from '../../contracts/enums.js';

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
  projectBriefAiProvider: AiProvider;
  projectBriefAiBaseUrl: string;
  projectBriefAiModel: string;
  projectBriefAiApiKey: string;
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

export abstract class RuntimeEnvironmentProvider {
  abstract read(): RuntimeEnvironment;
}
