export enum SourceChannel {
  Whatsapp = 'whatsapp',
  Github = 'github',
  External = 'external',
  AiChat = 'ai-chat',
  Ide = 'ide',
  Cli = 'cli',
  DependencyWatcher = 'dependency-watcher',
}

export enum TimelineCategory {
  All = 'all',
  Whatsapp = 'whatsapp',
  Github = 'github',
  Manual = 'manual',
  Reminder = 'reminder',
  AiChat = 'ai-chat',
  DependencyWatcher = 'dependency-watcher',
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

export enum CoverageHealthStatus {
  High = 'high',
  Moderate = 'moderate',
  Low = 'low',
}

export const COVERAGE_THRESHOLDS = {
  HIGH: 80,
  MODERATE: 50,
} as const;

export enum EmbeddingPriority {
  High = 'high',
  Low = 'low',
}

