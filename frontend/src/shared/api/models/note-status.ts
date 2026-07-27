export enum NoteStatus {
  Active = 'active',
  Pending = 'pending',
  Overdue = 'overdue',
  Sent = 'sent',
  Resolved = 'resolved',
  Archived = 'archived',
}

export const noteStatusValues = [
  NoteStatus.Active,
  NoteStatus.Pending,
  NoteStatus.Overdue,
  NoteStatus.Sent,
  NoteStatus.Resolved,
  NoteStatus.Archived,
] as const;

export enum StatusFilter {
  Open = 'open',
  All = 'all',
}

export type NoteStatusFilter = '' | StatusFilter.Open | NoteStatus;
export type ReminderStatusFilter = '' | StatusFilter | NoteStatus;

export enum QuickNoteStatus {
  Active = 'active',
  Resolved = 'resolved',
  Archived = 'archived',
}

export const quickNoteStatusValues = [
  QuickNoteStatus.Active,
  QuickNoteStatus.Resolved,
  QuickNoteStatus.Archived,
] as const;

