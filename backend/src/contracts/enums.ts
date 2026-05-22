export enum SourceChannel {
  Whatsapp = 'whatsapp',
  GithubPush = 'github-push',
  N8nWorkflow = 'n8n-workflow',
  External = 'external',
}

export enum EventType {
  ManualNote = 'manual_note',
  CodeReview = 'code_review',
  DailySummary = 'daily_summary',
  GenericRecord = 'generic_record',
}

export enum KnowledgeKind {
  Note = 'note',
  Bug = 'bug',
  Summary = 'summary',
  Article = 'article',
  Daily = 'daily',
}

export enum CanonicalType {
  Event = 'event',
  Knowledge = 'knowledge',
  Decision = 'decision',
  Incident = 'incident',
  Followup = 'followup',
}

export enum Importance {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum KnowledgeStatus {
  Active = 'active',
  Resolved = 'resolved',
  Archived = 'archived',
  Pending = 'pending',
  Overdue = 'overdue',
  Sent = 'sent',
}

export enum ReviewFindingSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum ConversationConfidence {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum OnboardingOperation {
  Upsert = 'upsert',
  Status = 'status',
}

export enum IntegrationProvider {
  Telegram = 'telegram',
  Whatsapp = 'whatsapp',
  AiReview = 'ai-review',
  AiConversation = 'ai-conversation',
  ProjectBriefAi = 'project-brief-ai',
  GithubApp = 'github-app',
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

export enum WebhookEventStatus {
  Rejected = 'rejected',
  Resolved = 'resolved',
  Processed = 'processed',
  Failed = 'failed',
}

export enum ReminderDispatchMode {
  Daily = 'daily',
  Exact = 'exact',
}

export enum ReminderDeliveryChannel {
  Whatsapp = 'whatsapp',
  Telegram = 'telegram',
}

export enum HomeTargetKind {
  Note = 'note',
  Project = 'project',
}

export enum HomePriorityType {
  Reminder = 'reminder',
  Finding = 'finding',
  Incident = 'incident',
  Followup = 'followup',
}

export enum AiProvider {
  OpenRouter = 'openrouter',
  OpenAi = 'openai',
  None = 'none',
}

export const integrationProviderValues = Object.values(IntegrationProvider);
