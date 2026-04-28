import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { runQuery } from '../../shared/api/client';
import { EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { NoteRow } from '../../widgets/notes/NoteRow';

export function SearchPage({ dashboard, openNote }: PageContext) {
  const [query, setQuery] = useState('timeout webhook deploy');
  const [projectSlug, setProjectSlug] = useState('');
  const result = useQuery({
    queryKey: ['search', query, projectSlug],
    queryFn: () => runQuery({ query, projectSlug, limit: 8 }),
    enabled: Boolean(query.trim()),
  });
  const noteByPath = new Map(dashboard.notes.map((note) => [note.path, note]));

  return (
    <>
      <PageHead title="Busca" subtitle="Consulta deterministica e semantica sobre notas, paths citados e resposta consolidada." />
      <section className="search-box">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex: riscos do ultimo push no n8n" type="search" />
        <div className="filters">
          <select>
            <option>{dashboard.workspaces[0]?.workspaceSlug || 'default'}</option>
          </select>
          <select value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)}>
            <option value="">Todos os projetos</option>
            {dashboard.projects.map((project) => (
              <option value={project.projectSlug} key={project.projectSlug}>
                {project.displayName}
              </option>
            ))}
          </select>
          <button className="icon-button" type="button" onClick={() => void result.refetch()}>
            Buscar
          </button>
        </div>
      </section>
      <section className="grid cols-2">
        <Panel>
          <h2>Resposta consolidada</h2>
          <p>{result.data?.answer.answer || 'Digite uma busca para consultar o vault.'}</p>
          <div className="list">
            {result.data?.answer.citedPaths.slice(0, 3).map((path) => (
              <div className="path" key={path}>
                {path}
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2>Resultados</h2>
          <div className="list">
            {result.data?.matches.map((match) => {
              const note = noteByPath.get(match.path);
              return note ? (
                <NoteRow key={match.path} note={note} dashboard={dashboard} onOpen={openNote} />
              ) : (
                <div className="path clickable" key={match.path}>
                  {match.path} / score {match.score}
                </div>
              );
            }) || <EmptyState>Tente outro termo ou remova filtros.</EmptyState>}
          </div>
        </Panel>
      </section>
    </>
  );
}
