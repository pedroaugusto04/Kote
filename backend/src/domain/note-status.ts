import { KnowledgeStatus } from '../contracts/enums.js';

export const noteStatusValues = [
  KnowledgeStatus.Active,
  KnowledgeStatus.Resolved,
  KnowledgeStatus.Archived,
  KnowledgeStatus.Pending,
  KnowledgeStatus.Overdue,
  KnowledgeStatus.Sent,
] as const;

export type NoteStatus = (typeof noteStatusValues)[number];

export const reminderDispatchEligibleStatuses = [
  KnowledgeStatus.Pending,
  KnowledgeStatus.Overdue,
] as const;

export function hasReminder(input: { reminderDate?: string; reminderAt?: string } | null | undefined) {
  return Boolean(String(input?.reminderDate || '').trim() || String(input?.reminderAt || '').trim());
}

function isTerminalNoteStatus(status: string | null | undefined) {
  return status === KnowledgeStatus.Resolved || status === KnowledgeStatus.Archived;
}

export function isReminderDispatchEligibleStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === KnowledgeStatus.Pending || normalized === KnowledgeStatus.Overdue;
}

export function normalizeManualNoteStatus(input: {
  requestedStatus?: string | null | undefined;
  currentStatus?: string | null | undefined;
  hadReminder: boolean;
  hasReminder: boolean;
}): NoteStatus {
  const requestedStatus = String(input.requestedStatus || '').trim().toLowerCase();
  const currentStatus = String(input.currentStatus || '').trim().toLowerCase();

  if (requestedStatus === KnowledgeStatus.Active) {
    return KnowledgeStatus.Active;
  }

  if (requestedStatus === KnowledgeStatus.Resolved || requestedStatus === KnowledgeStatus.Archived) {
    return requestedStatus;
  }

  if (input.hasReminder) {
    if (requestedStatus === KnowledgeStatus.Pending || requestedStatus === KnowledgeStatus.Overdue || requestedStatus === KnowledgeStatus.Sent) return requestedStatus;
    if (!input.hadReminder) return KnowledgeStatus.Pending;
    if (currentStatus === KnowledgeStatus.Sent) return KnowledgeStatus.Sent;
    if (currentStatus === KnowledgeStatus.Overdue) return KnowledgeStatus.Overdue;
    return KnowledgeStatus.Pending;
  }

  if (input.hadReminder && !input.hasReminder && !isTerminalNoteStatus(currentStatus)) {
    return KnowledgeStatus.Active;
  }

  if (currentStatus === KnowledgeStatus.Resolved || currentStatus === KnowledgeStatus.Archived) {
    return currentStatus;
  }

  return KnowledgeStatus.Active;
}

export function isReminderOverdue(input: {
  status?: string | null | undefined;
  reminderDate?: string | null | undefined;
  reminderTime?: string | null | undefined;
  reminderAt?: string | null | undefined;
  now?: Date;
}) {
  const status = String(input.status || '').trim().toLowerCase();
  if (status !== KnowledgeStatus.Pending && status !== KnowledgeStatus.Overdue) return false;

  const now = input.now || new Date();
  const reminderAt = String(input.reminderAt || '').trim();
  if (reminderAt) {
    const timestamp = Date.parse(reminderAt);
    return !Number.isNaN(timestamp) && timestamp < now.getTime();
  }

  const reminderDate = String(input.reminderDate || '').trim();
  if (!reminderDate) return false;
  const reminderTime = String(input.reminderTime || '').trim();
  const fallback = reminderTime ? `${reminderDate}T${reminderTime}:00.000Z` : `${reminderDate}T09:00:00.000Z`;
  const timestamp = Date.parse(fallback);
  return !Number.isNaN(timestamp) && timestamp < now.getTime();
}
