import { KnowledgeStatus } from './enums.js';
import { noteStatusValues } from '../domain/note-status.js';

export enum StatusFilter {
  Open = 'open',
  All = 'all',
}

export const notesListStatusFilterValues = ['', StatusFilter.Open, ...noteStatusValues] as const;

export const reminderListStatusFilterValues = [
  '',
  StatusFilter.Open,
  KnowledgeStatus.Active,
  StatusFilter.All,
  KnowledgeStatus.Pending,
  KnowledgeStatus.Overdue,
  KnowledgeStatus.Sent,
  KnowledgeStatus.Resolved,
  KnowledgeStatus.Archived,
] as const;

export const terminalStatuses = [KnowledgeStatus.Resolved, KnowledgeStatus.Archived] as const;
