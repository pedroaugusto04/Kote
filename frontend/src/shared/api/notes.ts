import type { NoteDetail } from './models/note';
import { request } from './request';

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`/api/notes/${encodeURIComponent(id)}`);
  return result.note;
}

export type CreateNoteParams = {
  projectSlug: string;
  title?: string;
  rawText: string;
  tags?: string[];
  reminderDate?: string;
  reminderTime?: string;
};

export type CreateNoteResponse = {
  ok: true;
  project: string;
  noteId: string;
  reminderNoteId: string;
  eventPath: string;
};

export function createNote(params: CreateNoteParams) {
  return request<CreateNoteResponse>('/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}
