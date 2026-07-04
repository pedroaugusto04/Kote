import type { PaginationMeta } from './pagination';

export type AskConversationTurn = {
  question: string;
  answer: string;
  projectSlug: string;
  timestamp: string;
};

export type AskResponse = {
  ok: boolean;
  conversationId: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
  relatedNotes: Array<{
    id: string;
    title: string;
    path: string;
    projectSlug?: string;
    workspaceSlug?: string;
  }>;
};

export type AskConversationSummary = {
  conversationId: string;
  title: string;
  projectId: string | null;
  createdAt: string;
};

export type AskConversationsResponse = {
  ok: true;
  conversations: AskConversationSummary[];
  pagination: PaginationMeta;
};

export type AskConversationDetailResponse = {
  ok: true;
  turns: AskHistoryItem[];
};

export type AskHistoryItem = {
  id: string;
  question: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  projectSlug: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
  relatedNotes: Array<{
    id: string;
    title: string;
    path: string;
    projectSlug?: string;
    workspaceSlug?: string;
  }>;
  createdAt: string;
};

export type AskHistoryResponse = {
  ok: true;
  history: AskHistoryItem[];
  pagination: PaginationMeta;
};
