import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectName, typeIcon } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';

export function NoteRow({ note, dashboard, onOpen }: { note: NoteSummary; dashboard: Dashboard; onOpen: (id: string) => void }) {
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
      <span className="file-icon">{typeIcon(note.type)}</span>
    </article>
  );
}
