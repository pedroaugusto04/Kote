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
  Reminder = 'reminder',
}

export enum Importance {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum KnowledgeStatus {
  Open = 'open',
  Active = 'active',
  Resolved = 'resolved',
  Archived = 'archived',
}

export enum ReviewFindingSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum ConversationPhase {
  Idle = 'idle',
  AwaitingKind = 'awaiting_kind',
  AwaitingProject = 'awaiting_project',
  AwaitingReminderDate = 'awaiting_reminder_date',
  AwaitingReminderTime = 'awaiting_reminder_time',
  AwaitingConfirmation = 'awaiting_confirmation',
}

export enum ConversationMissingField {
  ProjectSlug = 'projectSlug',
  Kind = 'kind',
  RawText = 'rawText',
  ReminderDate = 'reminderDate',
  ReminderTime = 'reminderTime',
  Confirmation = 'confirmation',
}

export enum ConversationConfidence {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum QueryMode {
  Search = 'search',
  Answer = 'answer',
}

export enum OnboardingOperation {
  Upsert = 'upsert',
  Status = 'status',
}

export enum IntegrationProvider {
  Telegram = 'telegram',
  Whatsapp = 'whatsapp',
  Evolution = 'evolution',
  AiReview = 'ai-review',
  AiConversation = 'ai-conversation',
  Github = 'github',
  GithubApp = 'github-app',
}

export enum ExternalIdentityProvider {
  Telegram = 'telegram',
  Whatsapp = 'whatsapp',
  Github = 'github',
  GithubApp = 'github-app',
}

export enum IntegrationSetupStatus {
  Connected = 'connected',
  Partial = 'partial',
  Missing = 'missing',
}

export enum StoredIntegrationStatus {
  Connected = 'connected',
  Missing = 'missing',
  Revoked = 'revoked',
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

export enum HomeTargetKind {
  Note = 'note',
  Review = 'review',
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
