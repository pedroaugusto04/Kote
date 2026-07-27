import { DEFAULT_PAGE_SIZE } from './models/pagination';
import type {
  AskHistoryResponse,
  AskResponse,
  AskConversationsResponse,
  AskConversationDetailResponse,
  AskConversationTurn,
} from './models/ask';
import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function runAsk(params: {
  question: string;
  projectSlug?: string;
  conversationId?: string;
  conversationHistory?: AskConversationTurn[];
}) {
  return request<AskResponse>(API_PATHS.ASK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function fetchAskHistory(params: { page?: number; pageSize?: number; projectSlug?: string } = {}) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
  });
  if (params.projectSlug) search.set('projectSlug', params.projectSlug);
  return request<AskHistoryResponse>(`${API_PATHS.ASK}/history?${search.toString()}`);
}

export function fetchAskConversations(params: { page?: number; pageSize?: number; projectSlug?: string } = {}) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
  });
  if (params.projectSlug) search.set('projectSlug', params.projectSlug);
  return request<AskConversationsResponse>(`${API_PATHS.ASK}/conversations?${search.toString()}`);
}

export function fetchConversationTurns(id: string) {
  return request<AskConversationDetailResponse>(`${API_PATHS.ASK}/conversations/${id}`);
}

