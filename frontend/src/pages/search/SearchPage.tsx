import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { fetchNotes, runQuery } from '../../shared/api/client';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { type NoteStatus } from '../../shared/api/models/note-status';
import { EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { Select } from '../../shared/ui/select';
import { useDebouncedValue } from '../../shared/ui/use-debounced-value';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { NoteRow } from '../../widgets/notes/NoteRow';

const SEARCH_DEBOUNCE_MS = 350;

const statusOptions: Array<{ value: '' | NoteStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

export function SearchPage({ dashboard, openNote, editNote, deleteNote }: PageContext) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const setQuery = (newQuery: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newQuery) {
        next.set('q', newQuery);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  };
  const [projectSlug, setProjectSlug] = useState('');
  const [status, setStatus] = useState<'' | NoteStatus>('');
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const debouncedProjectSlug = useDebouncedValue(projectSlug, SEARCH_DEBOUNCE_MS);
  const debouncedStatus = useDebouncedValue(status, SEARCH_DEBOUNCE_MS);
  const { page, setPage } = usePaginationState(`${debouncedQuery}:${debouncedProjectSlug}:${workspaceSlug}:${debouncedStatus}`);
  const hasQuery = Boolean(debouncedQuery.trim());
  const queryResult = useQuery({
    queryKey: ['search', debouncedQuery, debouncedProjectSlug, workspaceSlug, debouncedStatus, page],
    queryFn: () => runQuery({
      query: debouncedQuery,
      projectSlug: debouncedProjectSlug,
      workspaceSlug,
      status: debouncedStatus,
      limit: 10,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    enabled: hasQuery,
  });
  const notesResult = useQuery({
    queryKey: ['search-notes', debouncedProjectSlug, workspaceSlug, debouncedStatus, page],
    queryFn: () => fetchNotes({ page, workspaceSlug, projectSlug: debouncedProjectSlug, status: debouncedStatus }),
    enabled: !hasQuery,
    initialData: !hasQuery && dashboard.notes
      ? {
          ok: true as const,
          notes: dashboard.notes
            .filter((note) =>
              (!workspaceSlug || note.workspace === workspaceSlug)
              && (!debouncedProjectSlug || note.project === debouncedProjectSlug)
              && (!debouncedStatus || note.status === debouncedStatus),
            )
            .slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: dashboard.notes.filter((note) =>
              (!workspaceSlug || note.workspace === workspaceSlug)
              && (!debouncedProjectSlug || note.project === debouncedProjectSlug)
              && (!debouncedStatus || note.status === debouncedStatus),
            ).length,
            totalPages: Math.max(1, Math.ceil(dashboard.notes.filter((note) =>
              (!workspaceSlug || note.workspace === workspaceSlug)
              && (!debouncedProjectSlug || note.project === debouncedProjectSlug)
              && (!debouncedStatus || note.status === debouncedStatus),
            ).length / DEFAULT_PAGE_SIZE)),
            hasNext: dashboard.notes.filter((note) =>
              (!workspaceSlug || note.workspace === workspaceSlug)
              && (!debouncedProjectSlug || note.project === debouncedProjectSlug)
              && (!debouncedStatus || note.status === debouncedStatus),
            ).length > DEFAULT_PAGE_SIZE,
            hasPrevious: false,
          },
        }
      : undefined,
  });

  return (
    <>
      <PageHead title="Search" subtitle="" />
      <section className="search-box">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter what you are looking for..." type="search" />
        <div className="filters">
          <Select
            ariaLabel="Current workspace"
            className="search-filter search-filter-workspace"
            disabled
            options={[{ value: workspaceSlug || 'current-workspace', label: workspaceSlug || 'current-workspace' }]}
            value={workspaceSlug || 'current-workspace'}
            onChange={() => undefined}
          />
          <Select
            ariaLabel="Filter by project"
            className="search-filter search-filter-project"
            options={[
              { value: '', label: 'All projects' },
              ...dashboard.projects.map((project) => ({
                value: project.projectSlug,
                label: project.displayName,
              })),
            ]}
            value={projectSlug}
            onChange={setProjectSlug}
          />
          <Select
            ariaLabel="Filter by status"
            className="search-filter search-filter-status"
            options={statusOptions}
            value={status}
            onChange={(nextValue) => setStatus(nextValue as '' | NoteStatus)}
          />
        </div>
      </section>
      <Panel>
        <h2>Results</h2>
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
        {hasQuery && !queryResult.data?.matches.length ? <EmptyState>Try another term or remove some filters.</EmptyState> : null}
        {!hasQuery && !notesResult.data?.notes.length ? <EmptyState>No notes found with these filters.</EmptyState> : null}
      </Panel>
    </>
  );
}
