import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectName, typeIcon } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M11.9 1.6a1.5 1.5 0 0 1 2.1 2.1l-7.7 7.7-3.3.9.9-3.3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.8 3.7l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2.8 4.2h10.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.2 2.7h3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.1 4.2l.6 8.1h6.6l.6-8.1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

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
      <div>
        <div className="meta-row">
          <Badge value={note.type} />
          <span className="meta">
            {projectName(dashboard.projects, note.project)} / {note.date}
          </span>
        </div>
        <h3>{note.title}</h3>
        <p>{note.summary}</p>
      </div>
      <div className="row-actions">
        {onEdit ? (
          <button
            aria-label={`Editar nota ${note.title}`}
            className="row-action-button"
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
            aria-label={`Excluir nota ${note.title}`}
            className="row-action-button danger"
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
