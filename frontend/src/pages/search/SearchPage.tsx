import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { fetchNotes, runQuery } from '../../shared/api/client';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { NoteRow } from '../../widgets/notes/NoteRow';

export function SearchPage({ dashboard, openNote, editNote, deleteNote }: PageContext) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const setQuery = (newQuery: string) => {
    setSearchParams((prev) => {
      if (newQuery) {
        prev.set('q', newQuery);
      } else {
        prev.delete('q');
      }
      return prev;
    }, { replace: true });
  };
  const [projectSlug, setProjectSlug] = useState('');
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const { page, setPage } = usePaginationState(`${query}:${projectSlug}:${workspaceSlug}`);
  const hasQuery = Boolean(query.trim());
  const queryResult = useQuery({
    queryKey: ['search', query, projectSlug, workspaceSlug, page],
    queryFn: () => runQuery({ query, projectSlug, workspaceSlug, limit: 10, page, pageSize: DEFAULT_PAGE_SIZE }),
    enabled: hasQuery,
  });
  const notesResult = useQuery({
    queryKey: ['search-notes', projectSlug, workspaceSlug, page],
    queryFn: () => fetchNotes({ page, workspaceSlug, projectSlug }),
    enabled: !hasQuery,
    initialData: !hasQuery && dashboard.notes
      ? {
          ok: true as const,
          notes: dashboard.notes
            .filter((note) => (!workspaceSlug || note.workspace === workspaceSlug) && (!projectSlug || note.project === projectSlug))
            .slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: dashboard.notes.filter((note) => (!workspaceSlug || note.workspace === workspaceSlug) && (!projectSlug || note.project === projectSlug)).length,
            totalPages: Math.max(1, Math.ceil(dashboard.notes.filter((note) => (!workspaceSlug || note.workspace === workspaceSlug) && (!projectSlug || note.project === projectSlug)).length / DEFAULT_PAGE_SIZE)),
            hasNext: dashboard.notes.filter((note) => (!workspaceSlug || note.workspace === workspaceSlug) && (!projectSlug || note.project === projectSlug)).length > DEFAULT_PAGE_SIZE,
            hasPrevious: false,
          },
        }
      : undefined,
  });

  return (
    <>
      <PageHead title="Busca" subtitle="" />
      <section className="search-box">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Informe o que você está buscando..." type="search" />
        <div className="filters">
          <select>
            <option>{workspaceSlug || 'workspace-atual'}</option>
          </select>
          <select value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)}>
            <option value="">Todos os projetos</option>
            {dashboard.projects.map((project) => (
              <option value={project.projectSlug} key={project.projectSlug}>
                {project.displayName}
              </option>
            ))}
          </select>
          <button className="icon-button" type="button" onClick={() => void (hasQuery ? queryResult.refetch() : notesResult.refetch())}>
            Buscar
          </button>
        </div>
      </section>
      <Panel>
        <h2>Resultados</h2>
        <div className="list">
          {hasQuery
            ? queryResult.data?.matches.map((match) => (
              <NoteRow
                key={match.id}
                note={{ ...match, folderId: null }}
                dashboard={dashboard}
                onDelete={() => deleteNote({ id: match.id, title: match.title })}
                onEdit={() => editNote(match.id)}
                onOpen={openNote}
              />
            ))
            : notesResult.data?.notes.map((note) => (
              <NoteRow key={note.id} note={note} dashboard={dashboard} onDelete={() => deleteNote(note)} onEdit={() => editNote(note.id)} onOpen={openNote} />
            ))}
        </div>
        {hasQuery && queryResult.data ? <Pagination pagination={queryResult.data.pagination} onPageChange={setPage} /> : null}
        {!hasQuery && notesResult.data ? <Pagination pagination={notesResult.data.pagination} onPageChange={setPage} /> : null}
        {hasQuery && !queryResult.data?.matches.length ? <EmptyState>Tente outro termo ou remova filtros.</EmptyState> : null}
        {!hasQuery && !notesResult.data?.notes.length ? <EmptyState>Nenhuma nota encontrada com esses filtros.</EmptyState> : null}
      </Panel>
    </>
  );
}
