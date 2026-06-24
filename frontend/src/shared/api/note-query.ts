import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { fetchNote } from './client';
import type { NoteDetail } from './models/note';

export function noteDetailQueryKey(noteId: string) {
  return ['note', noteId] as const;
}

export function noteDetailQueryOptions(noteId: string) {
  return queryOptions({
    queryKey: noteDetailQueryKey(noteId),
    queryFn: () => fetchNote(noteId),
    enabled: Boolean(noteId),
  });
}

export function getCachedNoteDetail(queryClient: QueryClient, noteId: string) {
  return noteId ? queryClient.getQueryData<NoteDetail>(noteDetailQueryKey(noteId)) : undefined;
}

export function ensureNoteDetail(queryClient: QueryClient, noteId: string) {
  return queryClient.fetchQuery(noteDetailQueryOptions(noteId));
}

export async function invalidateNoteRelatedQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const topKey = query.queryKey[0];
      return typeof topKey === 'string' && !['auth', 'integrations', 'github-repositories'].includes(topKey);
    }
  });
}
