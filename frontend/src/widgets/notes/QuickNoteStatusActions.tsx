import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

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

function UndoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M6.1 5.2H3.2v-2.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M3.2 5.2c1.2-1.8 3.2-2.8 5.2-2.8 2.9 0 5.2 2.1 5.2 4.7s-2.3 4.7-5.2 4.7c-1.7 0-3.3-.7-4.5-1.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

type QuickStatusAction = {
  status: QuickNoteStatus;
  label: string;
  title: string;
  successMessage: string;
  className: 'success' | 'archive';
  icon: () => ReactNode;
};

function resolveQuickStatusActions(noteStatus: QuickStatusNote['status']): QuickStatusAction[] {
  if (noteStatus === 'resolved') {
    return [
      {
        status: 'active',
        label: 'Reopen',
        title: 'Reopen',
        successMessage: 'Note reopened.',
        className: 'success',
        icon: UndoIcon,
      },
    ];
  }

  if (noteStatus === 'archived') {
    return [
      {
        status: 'active',
        label: 'Unarchive',
        title: 'Unarchive',
        successMessage: 'Note unarchived.',
        className: 'success',
        icon: UndoIcon,
      },
    ];
  }

  return [
    {
      status: 'resolved',
      label: 'Resolve',
      title: 'Resolve',
      successMessage: 'Note resolved.',
      className: 'success',
      icon: ResolveIcon,
    },
    {
      status: 'archived',
      label: 'Archive',
      title: 'Archive',
      successMessage: 'Note archived.',
      className: 'archive',
      icon: ArchiveIcon,
    },
  ];
}

export function QuickNoteStatusActions({
  note,
  compact = false,
}: {
  note: QuickStatusNote;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const actions = resolveQuickStatusActions(note.status);
  const mutation = useMutation({
    mutationFn: async (action: QuickStatusAction) => {
      const detail = note.editor ? note : await ensureNoteDetail(queryClient, note.id);
      return updateNote(note.id, {
        title: detail.title,
        rawText: detail.editor?.rawText || detail.title,
        tags: detail.tags,
        reminderDate: detail.editor ? reminderInputDate(detail.editor) : '',
        reminderTime: detail.editor ? reminderInputTime(detail.editor) : '',
        status: action.status,
      });
    },
    onSuccess: async (_result, action) => {
      notifySuccess(action.successMessage);
      await invalidateNoteRelatedQueries(queryClient, note.id);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not update the note status.'),
  });

  return (
    <div className={`quick-note-status-actions${compact ? ' compact' : ''}`}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            aria-label={`${action.label} note ${note.title}`}
            className={`row-action-button ${action.className}`}
            key={`${note.status}-${action.status}-${action.label}`}
            type="button"
            title={action.title}
            disabled={mutation.isPending}
            onClick={(event) => {
              event.stopPropagation();
              mutation.mutate(action);
            }}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
