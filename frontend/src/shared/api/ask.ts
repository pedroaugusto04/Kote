import { DEFAULT_PAGE_SIZE } from './models/pagination';
import type {
  AskHistoryResponse,
  AskResponse,
  AskConversationsResponse,
  AskConversationDetailResponse,
  AskConversationTurn,
} from './models/ask';
import { request } from './request';
import { API_PATHS, buildApiUrl } from './api-paths.constants';

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
  return request<AskHistoryResponse>(buildApiUrl(`${API_PATHS.ASK}/history`, {
    page: params.page || 1,
    pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
    projectSlug: params.projectSlug || undefined,
  }));
}

export function fetchAskConversations(params: { page?: number; pageSize?: number; projectSlug?: string } = {}) {
  return request<AskConversationsResponse>(buildApiUrl(`${API_PATHS.ASK}/conversations`, {
    page: params.page || 1,
    pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
    projectSlug: params.projectSlug || undefined,
  }));
}

export function fetchConversationTurns(id: string) {
  return request<AskConversationDetailResponse>(`${API_PATHS.ASK}/conversations/${id}`);
}

