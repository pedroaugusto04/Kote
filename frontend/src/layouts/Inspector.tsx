import type { Dashboard } from '../shared/api/models/dashboard';
import { projectName } from '../entities/format';
import type { View } from '../app/routing/routes';

export function Inspector({
  dashboard,
  selectedProject,
  selectedNoteId,
  selectedReviewId,
  view,
}: {
  dashboard: Dashboard;
  selectedProject: string;
  selectedNoteId: string;
  selectedReviewId: string;
  view: View;
}) {
  const note = dashboard.notes.find((item) => item.id === selectedNoteId);
  const review = dashboard.reviews.find((item) => item.id === selectedReviewId);
  const project = dashboard.projects.find((item) => item.projectSlug === selectedProject);

  return (
    <div>
      <div className="inspector-block">
        <h2>Workspace</h2>
        <dl>
          <dt>Nome</dt>
          <dd>{dashboard.workspaces[0]?.displayName || 'Default Workspace'}</dd>
          <dt>Canais</dt>
          <dd>{dashboard.workspaces[0]?.githubRepos.join(', ') || 'local'}</dd>
        </dl>
      </div>
      <div className="inspector-block">
        <h2>Projeto selecionado</h2>
        <dl>
          <dt>Nome</dt>
          <dd>{project?.displayName || ''}</dd>
          <dt>Repo</dt>
          <dd>{project?.repoFullName || ''}</dd>
        </dl>
      </div>
      {view === 'reviews' && review ? (
        <div className="inspector-block">
          <h2>Review IA</h2>
          <dl>
            <dt>Repo</dt>
            <dd>{review.repo}</dd>
            <dt>Branch</dt>
            <dd>{review.branch}</dd>
            <dt>Findings</dt>
            <dd>{review.findings.length}</dd>
          </dl>
        </div>
      ) : null}
      {note ? (
        <div className="inspector-block">
          <h2>Nota atual</h2>
          <dl>
            <dt>Projeto</dt>
            <dd>{projectName(dashboard.projects, note.project)}</dd>
            <dt>Tipo</dt>
            <dd>{note.type}</dd>
            <dt>Status</dt>
            <dd>{note.status}</dd>
            <dt>Origem</dt>
            <dd>{note.source}</dd>
          </dl>
        </div>
      ) : null}
      <div className="inspector-block">
        <h2>Acoes rapidas</h2>
        <div className="toolbar">
          <button className="icon-button" type="button">
            Abrir nota
          </button>
          <button className="filter-chip" type="button">
            Buscar relacionados
          </button>
        </div>
      </div>
    </div>
  );
}
