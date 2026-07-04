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
  projectId?: string;
  workspaceId?: string;
};

export type AskHistoryItem = {
  id: string;
  conversationId: string;
  question: string;
  answer: string;
  confidence: ConversationConfidence;
  projectId: string | null;
  sources: AskHistorySource[];
  relatedNotes: AskHistoryRelatedNote[];
  createdAt: string;
};

export type SaveAskHistoryInput = {
  userId: string;
  projectId: string | null;
  workspaceId: string | null;
  conversationId: string;
  question: string;
  answer: string;
  confidence: ConversationConfidence;
  sources: AskHistorySource[];
  relatedNotes: AskHistoryRelatedNote[];
};

export type AskConversationSummary = {
  conversationId: string;
  title: string;
  projectId: string | null;
  createdAt: string;
};

export type ListAskHistoryInput = { 
  userId: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
};

export type AskHistoryResult = PaginatedResult<AskHistoryItem>;
