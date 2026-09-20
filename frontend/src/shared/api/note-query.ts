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
  // A note mutation affects these views, but must not refetch unrelated billing,
  // integration, webhook, or Ask AI data.
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['note'] }),
    queryClient.invalidateQueries({ queryKey: ['notes'] }),
    queryClient.invalidateQueries({ queryKey: ['project-timeline'] }),
    queryClient.invalidateQueries({ queryKey: ['project-folders'] }),
    queryClient.invalidateQueries({ queryKey: ['projects-search'] }),
    queryClient.invalidateQueries({ queryKey: ['global-search-popover'] }),
    queryClient.invalidateQueries({ queryKey: ['home-project-timeline'] }),
    queryClient.invalidateQueries({ queryKey: ['projectCoverage'] }),
    queryClient.invalidateQueries({ queryKey: ['reminders'] }),
    queryClient.invalidateQueries({ queryKey: ['reminder-board'] }),
  ]);
}
