export const noteStatusValues = ['active', 'pending', 'overdue', 'sent', 'resolved', 'archived'] as const;

export type NoteStatus = (typeof noteStatusValues)[number];

export const quickNoteStatusValues = ['resolved', 'archived'] as const;

export type QuickNoteStatus = (typeof quickNoteStatusValues)[number];
