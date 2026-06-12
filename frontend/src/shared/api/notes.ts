import type { CanonicalNoteType, NoteDetail, NoteSummary } from './models/note';
import type { NoteStatus, QuickNoteStatus } from './models/note-status';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import { request } from './request';

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`/api/notes/${encodeURIComponent(id)}`);
  return result.note;
}

export function fetchNotes(params: { page?: number; pageSize?: number; workspaceSlug?: string; projectSlug?: string; folderId?: string; status?: '' | 'open' | NoteStatus; selectedId?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    folderId: params.folderId || '',
    status: params.status || '',
    selectedId: params.selectedId || '',
  });
  return request<PaginatedResponse<NoteSummary, 'notes'>>(`/api/notes?${search.toString()}`);
}

export type CreateNoteParams = {
  projectSlug: string;
  folderId?: string;
  title?: string;
  rawText: string;
  tags?: string[];
  status?: QuickNoteStatus;
  canonicalType?: CanonicalNoteType;
  reminderDate?: string;
  reminderTime?: string;
  reminderAt?: string;
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
    reminderDate: string;
    reminderTime: string;
    reminderAt: string;
    hasReminder: boolean;
    attachmentCount: number;
  };
};

export function createNote(params: CreateNoteParams) {
  return request<CreateNoteResponse>('/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export type UpdateNoteParams = {
  folderId?: string;
  title?: string;
  rawText: string;
  tags?: string[];
  status?: QuickNoteStatus;
  canonicalType?: CanonicalNoteType;
  reminderDate?: string;
  reminderTime?: string;
  reminderAt?: string;
};

export function updateNote(id: string, params: UpdateNoteParams) {
  return request<{ ok: true; noteId: string }>(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteNote(id: string) {
  return request<{ ok: true; noteId: string }>(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function pinNote(id: string, pinned: boolean) {
  return request<{ ok: true; noteId: string; pinned: boolean }>(`/api/notes/${encodeURIComponent(id)}/pin`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pinned }),
  });
}

export function fetchRelatedNotes(id: string): Promise<NoteSummary[]> {
  return request<NoteSummary[]>(`/api/notes/${encodeURIComponent(id)}/related`);
}

