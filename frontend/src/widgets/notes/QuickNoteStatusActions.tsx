import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateNote } from '../../shared/api/client';
import { reminderInputDate, reminderInputTime } from '../../entities/format';
import type { NoteDetail, NoteSummary } from '../../shared/api/models/note';
import type { QuickNoteStatus } from '../../shared/api/models/note-status';
import { ensureNoteDetail, invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';

type QuickStatusNote = Pick<NoteSummary, 'id' | 'title' | 'status' | 'project' | 'tags'> & {
  isOverdue?: boolean;
  editor?: NoteDetail['editor'];
};

function ResolveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8.1l1.7 1.7 3.4-3.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2.7 4.1h10.6v7.2a1 1 0 0 1-1 1H3.7a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M2.3 3h11.4v2.3H2.3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M6 7.6h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

export function QuickNoteStatusActions({
  note,
  compact = false,
}: {
  note: QuickStatusNote;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (status: QuickNoteStatus) => {
      const detail = note.editor ? note : await ensureNoteDetail(queryClient, note.id);
      return updateNote(note.id, {
        title: detail.title,
        rawText: detail.editor?.rawText || detail.title,
        tags: detail.tags,
        reminderDate: detail.editor ? reminderInputDate(detail.editor) : '',
        reminderTime: detail.editor ? reminderInputTime(detail.editor) : '',
        status,
      });
    },
    onSuccess: async (_result, status) => {
      notifySuccess(status === 'resolved' ? 'Note resolved.' : 'Note archived.');
      await invalidateNoteRelatedQueries(queryClient, note.id);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not update the note status.'),
  });

  if (note.status === 'resolved' || note.status === 'archived') return null;

  return (
    <div className={`quick-note-status-actions${compact ? ' compact' : ''}`}>
      <button
        aria-label={`Resolve note ${note.title}`}
        className="row-action-button"
        type="button"
        title="Resolve"
        disabled={mutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          mutation.mutate('resolved');
        }}
      >
        <ResolveIcon />
      </button>
      <button
        aria-label={`Archive note ${note.title}`}
        className="row-action-button"
        type="button"
        title="Archive"
        disabled={mutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          mutation.mutate('archived');
        }}
      >
        <ArchiveIcon />
      </button>
    </div>
  );
}
