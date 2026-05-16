import { useQuery } from '@tanstack/react-query';

import { formatUsDate, noteStatusLabel, noteTypeLabel, projectName } from '../entities/format';
import type { Dashboard } from '../shared/api/models/dashboard';
import { noteDetailQueryOptions } from '../shared/api/note-query';

export function Inspector({
  dashboard,
  selectedProject,
  selectedNoteId,
}: {
  dashboard: Dashboard;
  selectedProject: string;
  selectedNoteId: string;
}) {
  const noteQuery = useQuery(noteDetailQueryOptions(selectedNoteId));
  const note = noteQuery.data;
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
