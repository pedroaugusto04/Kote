import type { Dashboard } from '../../shared/api/models/dashboard';
import { Badge } from '../../shared/ui/primitives';

export function ProjectCard({ project, onOpen }: { project: Dashboard['projects'][number]; onOpen: (slug: string) => void }) {
  return (
    <article className="card clickable" onClick={() => onOpen(project.projectSlug)}>
      <div className="card-kicker">{project.workspaceSlug || 'default'}</div>
      <h3>{project.displayName}</h3>
      <p>{project.repoFullName}</p>
      <div className="meta-row">
        <Badge value={project.enabled ? 'active' : 'archived'} tone={project.enabled ? 'active' : 'archived'} />
        <span className="meta">{project.defaultTags.slice(0, 2).join(' / ')}</span>
      </div>
    </article>
  );
}
