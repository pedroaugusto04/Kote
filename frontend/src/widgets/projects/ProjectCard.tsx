import type { Dashboard } from '../../shared/api/models/dashboard';
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

export function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
  deleteDisabled = false,
  deleteLabel,
}: {
  project: Dashboard['projects'][number];
  onOpen: (slug: string) => void;
  onEdit?: (project: Dashboard['projects'][number]) => void;
  onDelete?: (project: Dashboard['projects'][number]) => void;
  deleteDisabled?: boolean;
  deleteLabel?: string;
}) {
  return (
    <article className="card clickable" onClick={() => onOpen(project.projectSlug)}>
      {onEdit || onDelete ? (
        <div className="card-actions">
          {onEdit ? (
            <button
              aria-label={`Editar projeto ${project.displayName}`}
              className="row-action-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(project);
              }}
            >
              <PencilIcon />
            </button>
          ) : null}
          {onDelete ? (
            <button
              aria-label={deleteLabel || `Excluir projeto ${project.displayName}`}
              className="row-action-button danger"
              disabled={deleteDisabled}
              title={deleteDisabled ? deleteLabel : undefined}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!deleteDisabled) onDelete(project);
              }}
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="card-kicker">{project.workspaceSlug || 'workspace'}</div>
      <h3>{project.displayName}</h3>
      <p>{project.repoFullName}</p>
      <div className="meta-row">
        <Badge value={project.enabled ? 'active' : 'archived'} tone={project.enabled ? 'active' : 'archived'} />
        <span className="meta">{project.defaultTags.slice(0, 2).join(' / ')}</span>
      </div>
    </article>
  );
}
