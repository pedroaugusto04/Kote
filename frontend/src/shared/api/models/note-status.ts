export const noteStatusValues = ['active', 'pending', 'overdue', 'sent', 'resolved', 'archived'] as const;

export type NoteStatus = (typeof noteStatusValues)[number];

export enum StatusFilter {
  Open = 'open',
  All = 'all',
}

export type NoteStatusFilter = '' | StatusFilter.Open | NoteStatus;
export type ReminderStatusFilter = '' | StatusFilter | NoteStatus;

const quickNoteStatusValues = ['active', 'resolved', 'archived'] as const;

export type QuickNoteStatus = (typeof quickNoteStatusValues)[number];
