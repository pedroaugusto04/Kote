export enum IntegrationProvider {
  Telegram = 'telegram',
  Whatsapp = 'whatsapp',
  AiReview = 'ai-review',
  AiConversation = 'ai-conversation',
  ProjectBriefAi = 'project-brief-ai',
  PrContextAi = 'pr-context-ai',
  GithubApp = 'github-app',
  PushNotifications = 'push-notifications',
}

export enum ExternalIdentityProvider {
  Telegram = 'telegram',
  Whatsapp = 'whatsapp',
  GithubApp = 'github-app',
}

export enum IntegrationSetupStatus {
  Connected = 'connected',
  Partial = 'partial',
  Missing = 'missing',
  Pending = 'pending',
  Error = 'error',
  Disabled = 'disabled',
}

export enum StoredIntegrationStatus {
  Connected = 'connected',
  Missing = 'missing',
  Revoked = 'revoked',
  Pending = 'pending',
  Error = 'error',
  Disabled = 'disabled',
}

export enum CredentialRecordStatus {
  Connected = 'connected',
  Revoked = 'revoked',
}

export enum IntegrationActionType {
  Connect = 'connect',
  Revoke = 'revoke',
  None = 'none',
}

export enum ExternalIdentityType {
  Jid = 'jid',
  ChatId = 'chat_id',
}

export enum ExternalIdKey {
  ChatJid = 'chatJid',
  ChatId = 'chatId',
}

export enum WorkspaceBindingField {
  WhatsappChatJid = 'whatsappChatJid',
  TelegramChatId = 'telegramChatId',
}

export enum ConnectionCallbackStatus {
  Connected = 'connected',
  Error = 'error',
}

export enum MissingCredentialError {
  NotFound = 'not_found',
  ConnectionRequired = 'connection_required',
}
