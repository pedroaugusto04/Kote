export const noteStatusValues = ['active', 'pending', 'overdue', 'sent', 'resolved', 'archived'] as const;

export type NoteStatus = (typeof noteStatusValues)[number];

const quickNoteStatusValues = ['active', 'resolved', 'archived'] as const;

export type QuickNoteStatus = (typeof quickNoteStatusValues)[number];
