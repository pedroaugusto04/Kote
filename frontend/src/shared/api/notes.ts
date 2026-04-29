import type { NoteDetail } from './models/note';
import { request } from './request';

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`/api/notes/${encodeURIComponent(id)}`);
  return result.note;
}
