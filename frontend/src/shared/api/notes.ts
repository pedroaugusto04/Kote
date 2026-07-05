import type { NoteDetail, NoteSummary } from './models/note';
import type { NoteStatusFilter, QuickNoteStatus } from './models/note-status';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import { request, requestText } from './request';
import { API_PATHS } from './api-paths.constants';

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`${API_PATHS.NOTES}/${encodeURIComponent(id)}`);
  return result.note;
}

export function fetchNotes(params: { page?: number; pageSize?: number; workspaceSlug?: string; projectSlug?: string; folderId?: string; status?: NoteStatusFilter; selectedId?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    folderId: params.folderId || '',
    status: params.status || '',
    selectedId: params.selectedId || '',
  });
  return request<PaginatedResponse<NoteSummary, 'notes'>>(`${API_PATHS.NOTES}?${search.toString()}`);
}

export type CreateNoteParams = {
  projectSlug: string;
  folderId?: string;
  title?: string;
  rawText: string;
  tags?: string[];
  status?: QuickNoteStatus;
  categoryIds?: string[];
  reminderAt?: string;
  sourceChannel?: string;
  source?: string;
  sessionId?: string;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }>;
};

export type CreateNoteResponse = {
  ok: true;
  project: string;
  noteId: string;
  eventPath: string;
  note: {
    id: string;
    title: string;
    type: string;
    status: string;
    projectSlug: string;
    projectName: string;
    workspaceSlug: string;
    folderId: string | null;
    folderName: string;
    folderPath: string;
    eventPath: string;
    reminderAt: string;
    hasReminder: boolean;
    attachmentCount: number;
  };
};

export function createNote(params: CreateNoteParams) {
  return request<CreateNoteResponse>(API_PATHS.NOTES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export type UpdateNoteParams = {
  projectSlug?: string;
  folderId?: string;
  title?: string;
  rawText: string;
  tags?: string[];
  status?: QuickNoteStatus;
  categoryIds?: string[];
  reminderAt?: string;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }>;
};

export function updateNote(id: string, params: UpdateNoteParams) {
  return request<{ ok: true; noteId: string }>(`${API_PATHS.NOTES}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function bulkUpdateNoteStatuses(ids: string[], status: QuickNoteStatus) {
  return request<{ ok: true; updatedCount: number }>(`${API_PATHS.NOTES}/bulk/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
}

export function deleteNote(id: string) {
  return request<{ ok: true; noteId: string }>(`${API_PATHS.NOTES}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function pinNote(id: string, pinned: boolean) {
  return request<{ ok: true; noteId: string; pinned: boolean }>(`${API_PATHS.NOTES}/${encodeURIComponent(id)}/pin`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pinned }),
  });
}

export function fetchRelatedNotes(id: string): Promise<NoteSummary[]> {
  return request<NoteSummary[]>(`${API_PATHS.NOTES}/${encodeURIComponent(id)}/related`);
}

export function fetchAttachmentText(url: string): Promise<string> {
  return requestText(url);
}

export function fetchAutoActionGlobal(): Promise<{ enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours: number | null } | null> {
  return request(`${API_PATHS.NOTES}/auto/global`);
}

export function setAutoActionGlobal(input: { enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours?: number | null }) {
  return request<{ ok: true }>(`${API_PATHS.NOTES}/auto/global`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
