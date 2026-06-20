import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { formatUsDate, projectName, typeIcon, getCleanSummary } from '../../shared/utils/format';
import { Tags } from '../../shared/ui/primitives';
import { AttachmentIndicator } from './AttachmentIndicator';
import { QuickNoteStatusActions } from './QuickNoteStatusActions';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { pinNote } from '../../shared/api/client';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { buildNoteDisplayTags } from '../../shared/utils/note-tags';

function PinIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.91a2 2 0 0 1-.43-1.24V5a2 2 0 0 0-2-2h-3.6a2 2 0 0 0-2 2v4.85a2 2 0 0 1-.43 1.24l-2.33 2.91a2 2 0 0 0-.44 1.24z" />
    </svg>
  );
}

export function NoteRow({
  note,
  dashboard,
  onOpen,
  onDoubleClick,
  onEdit,
  onDelete,
  onPinSuccess,
}: {
  note: NoteSummary;
  dashboard: Dashboard;
  onOpen: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  onEdit?: (note: NoteSummary) => void;
  onDelete?: (note: NoteSummary) => void;
  onPinSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => pinNote(note.id, !note.isPinned),
    onSuccess: async () => {
      notifySuccess(note.isPinned ? 'Note unpinned.' : 'Note pinned.');
      await invalidateNoteRelatedQueries(queryClient);
      onPinSuccess?.();
    },
    onError: (error) => {
      notifyGeneralFormError(error, 'Could not toggle pin status.');
    },
  });

  const displayTags = buildNoteDisplayTags(note);

  return (
    <article className="list-row clickable" onClick={() => onOpen(note.id)} onDoubleClick={() => onDoubleClick?.(note.id)}>
      <div className="list-row-body note-row-body">
        <div className="meta-row">
          {note.isPinned && (
            <span className="pinned-badge" title="Pinned Note" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--amber)', fontSize: '11px', fontWeight: 'bold' }}>
              <PinIcon active /> Pinned
            </span>
          )}
          <span className="meta meta-project">
            {projectName(dashboard.projects, note.project)}
          </span>
          <span className="meta-separator"> / </span>
          <span className="meta meta-date">
            {formatUsDate(note.date)}
          </span>
          <AttachmentIndicator count={note.attachmentCount || 0} />
        </div>
        <h3>{note.title}</h3>
        {displayTags.length ? <Tags items={displayTags} /> : null}
        <p>{getCleanSummary(note.summary)}</p>
      </div>
      <button
        aria-label={note.isPinned ? `Unpin note ${note.title}` : `Pin note ${note.title}`}
        className={`row-action-button pin ${note.isPinned ? 'active' : ''}`}
        title={note.isPinned ? 'Unpin' : 'Pin'}
        type="button"
        disabled={mutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          mutation.mutate();
        }}
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          zIndex: 2,
        }}
      >
        <PinIcon active={note.isPinned} />
      </button>
      <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end', marginTop: 'auto' }}>
        <QuickNoteStatusActions note={note} compact />
        {onEdit ? (
          <button
            aria-label={`Edit note ${note.title}`}
            className="row-action-button edit"
            title="Edit"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(note);
            }}
          >
            <PencilIcon />
          </button>
        ) : null}
        {onDelete ? (
          <button
            aria-label={`Delete note ${note.title}`}
            className="row-action-button danger"
            title="Delete"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(note);
            }}
          >
            <TrashIcon />
          </button>
        ) : null}
        <span className="file-icon" style={{ marginLeft: '4px', textAlign: 'center' }}>{typeIcon(note.type)}</span>
      </div>
    </article>
  );
}




