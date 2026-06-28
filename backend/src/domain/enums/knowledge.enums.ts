export enum SourceChannel {
  Whatsapp = 'whatsapp',
  GithubPush = 'github-push',
  N8nWorkflow = 'n8n-workflow',
  External = 'external',
  AiChat = 'ai-chat',
  Ide = 'ide',
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

export enum SpecialQueryIntent {
  Recent = 'recent',
  ActionItems = 'action_items',
  Decisions = 'decisions',
}
