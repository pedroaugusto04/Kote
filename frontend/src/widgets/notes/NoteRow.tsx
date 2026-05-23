import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName, typeIcon } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';
import { AttachmentIndicator } from './AttachmentIndicator';
import { QuickNoteStatusActions } from './QuickNoteStatusActions';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';



export function NoteRow({
  note,
  dashboard,
  onOpen,
  onEdit,
  onDelete,
}: {
  note: NoteSummary;
  dashboard: Dashboard;
  onOpen: (id: string) => void;
  onEdit?: (note: NoteSummary) => void;
  onDelete?: (note: NoteSummary) => void;
}) {
  return (
    <article className="list-row clickable" onClick={() => onOpen(note.id)}>
      <div className="list-row-body note-row-body">
        <div className="meta-row">
          <Badge value={noteTypeLabel(note.type)} tone={note.type} />
          <Badge value={formatDisplayToken(note.status)} tone={note.status} />
          <span className="meta">
            {projectName(dashboard.projects, note.project)} / {formatUsDate(note.date)}
          </span>
          <AttachmentIndicator count={note.attachmentCount || 0} />
        </div>
        <h3>{note.title}</h3>
        <p>{note.summary}</p>
      </div>
      <div className="row-actions">
        <QuickNoteStatusActions note={note} compact />
        {onEdit ? (
          <button
            aria-label={`Edit note ${note.title}`}
            className="row-action-button"
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
        <span className="file-icon">{typeIcon(note.type)}</span>
      </div>
    </article>
  );
}
