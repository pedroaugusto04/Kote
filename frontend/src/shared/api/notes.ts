import type { NoteDetail, NoteSummary } from './models/note';
import type { PaginatedResponse } from './models/pagination';
import { request } from './request';

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`/api/notes/${encodeURIComponent(id)}`);
  return result.note;
}

export function fetchNotes(params: { page?: number; pageSize?: number; workspaceSlug?: string; projectSlug?: string; selectedId?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 10),
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    selectedId: params.selectedId || '',
  });
  return request<PaginatedResponse<NoteSummary, 'notes'>>(`/api/notes?${search.toString()}`);
}

export type CreateNoteParams = {
  projectSlug: string;
  title?: string;
  rawText: string;
  tags?: string[];
  reminderDate?: string;
  reminderTime?: string;
  reminderAt?: string;
};

export type CreateNoteResponse = {
  ok: true;
  project: string;
  noteId: string;
  eventPath: string;
};

export function createNote(params: CreateNoteParams) {
  return request<CreateNoteResponse>('/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export type UpdateNoteParams = {
  title?: string;
  rawText: string;
  tags?: string[];
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
