import type { PaginatedResult } from '../../contracts/pagination.js';
import { ConversationConfidence } from '../../contracts/enums.js';

export type AskHistorySource = {
  noteId: string;
  title: string;
  path: string;
};

export type AskHistoryRelatedNote = {
  id: string;
  title: string;
  path: string;
  projectSlug?: string;
  workspaceSlug?: string;
};

export type AskHistoryItem = {
  id: string;
  question: string;
  answer: string;
  confidence: ConversationConfidence;
  projectSlug: string;
  sources: AskHistorySource[];
  relatedNotes: AskHistoryRelatedNote[];
  createdAt: string;
};

export type SaveAskHistoryInput = {
  userId: string;
  projectSlug: string;
  question: string;
  answer: string;
  confidence: ConversationConfidence;
  sources: AskHistorySource[];
  relatedNotes: AskHistoryRelatedNote[];
};

export type ListAskHistoryInput = {
  userId: string;
  projectSlug?: string;
  page: number;
  pageSize: number;
};

export type AskHistoryResult = PaginatedResult<AskHistoryItem>;
