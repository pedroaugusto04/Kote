import { useQuery } from '@tanstack/react-query';

import { formatUsDate, noteStatusLabel, noteTypeLabel, projectName } from '../entities/format';
import type { View } from '../app/routing/routes';
import { fetchNote, fetchReview } from '../shared/api/client';
import type { Dashboard } from '../shared/api/models/dashboard';

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
  const noteQuery = useQuery({
    queryKey: ['note', selectedNoteId],
    queryFn: () => fetchNote(selectedNoteId),
    enabled: Boolean(selectedNoteId),
  });
  const reviewQuery = useQuery({
    queryKey: ['review', selectedReviewId],
    queryFn: () => fetchReview(selectedReviewId),
    enabled: Boolean(selectedReviewId),
  });
  const note = noteQuery.data;
  const review = reviewQuery.data;
  const project = dashboard.projects.find((item) => item.projectSlug === selectedProject);

  return (
    <div>
      <div className="inspector-block">
        <h2>Workspace</h2>
        <dl>
          <dt>Nome</dt>
          <dd>{dashboard.workspaces[0]?.displayName || 'Workspace atual'}</dd>
          <dt>Canais</dt>
          <dd>{Array.from(new Set(dashboard.projects.flatMap(p => p.repositories.map(r => r.fullName)))).join(', ') || 'local'}</dd>
        </dl>
      </div>
      <div className="inspector-block">
        <h2>Projeto selecionado</h2>
        <dl>
          <dt>Nome</dt>
          <dd>{project?.displayName || ''}</dd>
          <dt>Repo</dt>
          <dd>{project?.repositories.map(r => r.fullName).join(', ') || ''}</dd>
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
            <dd>{noteTypeLabel(note.type)}</dd>
            <dt>Status</dt>
            <dd>{noteStatusLabel(note.status)}</dd>
            <dt>Data</dt>
            <dd>{formatUsDate(note.date)}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
