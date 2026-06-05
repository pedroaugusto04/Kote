import type { Dashboard } from '../../shared/api/models/dashboard';
import { formatDisplayToken } from '../../shared/utils/format';
import { Badge } from '../../shared/ui/primitives';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { Line, LineChart, ResponsiveContainer } from 'recharts';



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
              aria-label={`Edit project ${project.displayName}`}
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
              aria-label={deleteLabel || `Delete project ${project.displayName}`}
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
      <div className="card-repos">
        {project.repositories.map((repo) => (
          <span key={repo.externalId} className="repo-tag">
            {repo.fullName}
          </span>
        ))}
        {project.repositories.length === 0 && <span className="repo-tag empty">No repos</span>}
      </div>
      <div className="meta-row">
        <Badge value={formatDisplayToken(project.enabled ? 'active' : 'archived')} tone={project.enabled ? 'active' : 'archived'} />
        <span className="meta">{project.defaultTags.slice(0, 2).join(' / ')}</span>
        {project.activitySparkline && (
          <div className="project-sparkline" style={{ width: '60px', height: '20px', marginLeft: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={project.activitySparkline}>
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--sparkline-stroke, var(--text-muted))"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </article>
  );
}
