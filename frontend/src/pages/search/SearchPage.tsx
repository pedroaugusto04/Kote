import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken } from '../../shared/utils/format';
import { fetchAskHistory, fetchNotes, runAsk, runQuery } from '../../shared/api/client';
import type { AskHistoryResponse } from '../../shared/api/models/ask';
import type { AskAnswerCardItem } from '../../widgets/ask/ask-answer-card.models';
import { AskAnswerCard, projectLabel } from '../../widgets/ask/AskAnswerCard';
import { AskAiIcon } from '../../widgets/ask/AskAiIcon';
import type { NoteSummary } from '../../shared/api/models/note';
import { type NoteStatus } from '../../shared/api/models/note-status';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { EmptyState, InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { Select } from '../../shared/ui/select';
import { notifyWarning } from '../../shared/ui/notifications';
import { useDebouncedValue } from '../../shared/ui/use-debounced-value';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { SideNoteDrawer } from '../../widgets/notes/SideNoteDrawer';
import './SearchPage.css';

const SEARCH_DEBOUNCE_MS = 350;
const ASK_HISTORY_PAGE_SIZE = 3;

const statusOptions: Array<{ value: '' | 'open' | NoteStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  ...(['active', 'pending', 'overdue', 'sent', 'resolved', 'archived'] as NoteStatus[]).map((value) => ({
    value,
    label: formatDisplayToken(value),
  })),
];

export function SearchPage({ dashboard, openNote, editNote, deleteNote }: PageContext) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);
  const [projectSlug, setProjectSlug] = useState('');
  const [status, setStatus] = useState<'' | 'open' | NoteStatus>('open');
  const [askAnswer, setAskAnswer] = useState<AskAnswerCardItem | null>(null);
  const [isAnswerHidden, setIsAnswerHidden] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [sideNoteId, setSideNoteId] = useState<string | null>(null);
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const debouncedQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const debouncedProjectSlug = useDebouncedValue(projectSlug, SEARCH_DEBOUNCE_MS);
  const debouncedStatus = useDebouncedValue(status, SEARCH_DEBOUNCE_MS);
  const hasQuery = Boolean(debouncedQuery.trim());
  const resultsPaginationKey = `${debouncedQuery}:${debouncedProjectSlug}:${workspaceSlug}:${debouncedStatus}`;
  const { page, setPage } = usePaginationState(resultsPaginationKey);
  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedQuery) {
        next.set('q', debouncedQuery);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  }, [debouncedQuery, setSearchParams]);

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
    placeholderData: keepPreviousData,
  });
  const notesResult = useQuery({
    queryKey: ['search-notes', debouncedProjectSlug, workspaceSlug, debouncedStatus, page],
    queryFn: () => fetchNotes({ page, workspaceSlug, projectSlug: debouncedProjectSlug, status: debouncedStatus }),
    enabled: !hasQuery,
    placeholderData: keepPreviousData,
    initialData: !hasQuery && dashboard.notes
      ? dashboardNotesPage(dashboard.notes, {
        workspaceSlug,
        projectSlug: debouncedProjectSlug,
        status: debouncedStatus,
      })
      : undefined,
  });
  const historyQuery = useQuery({
    queryKey: ['ask-history', projectSlug, historyPage],
    queryFn: () => fetchAskHistory({ projectSlug, page: historyPage, pageSize: ASK_HISTORY_PAGE_SIZE }),
    enabled: showHistory,
    placeholderData: keepPreviousData,
  });

  const selectedProjectLabel = projectLabel(projectSlug, dashboard.projects);
  const visibleNotes = hasQuery
    ? queryResult.data?.matches.map(queryMatchToNoteSummary) || []
    : notesResult.data?.notes || [];
  const pagination = hasQuery ? queryResult.data?.pagination : notesResult.data?.pagination;
  const isResultsStale = hasQuery ? queryResult.isPlaceholderData : notesResult.isPlaceholderData;
  const isResultsFetching = hasQuery ? queryResult.isFetching : notesResult.isFetching;
  const isResultsError = hasQuery ? queryResult.isError : notesResult.isError;
  const {
    isMobilePagination,
    loadedMobilePage,
    visibleItems: paginatedVisibleNotes,
  } = useMobilePaginatedItems({
    items: visibleNotes,
    pagination,
    resetKey: resultsPaginationKey,
    isPlaceholderData: isResultsStale,
  });

  const handleAsk = async () => {
    const question = searchInput.trim();
    if (isAsking) return;
    if (!question) {
      notifyWarning('Type something before asking AI.');
      return;
    }

    setIsAsking(true);
    setAskError(null);
    setAskAnswer(null);
    setIsAnswerHidden(false);
    setShowHistory(false);

    try {
      const result = await runAsk({ question, projectSlug });
      if (result?.ok) {
        setAskAnswer({
          question,
          answer: result.answer,
          projectSlug,
          sources: result.sources || [],
        });
        setIsAnswerHidden(false);
        setHistoryPage(1);
        await queryClient.invalidateQueries({ queryKey: ['ask-history'] });
      } else {
        setAskError('Could not generate an answer. Please try again.');
      }
    } catch (error: unknown) {
      setAskError(error instanceof Error ? error.message : 'An unexpected error occurred while communicating with the AI.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <>
      <PageHead title="Search" subtitle="Search notes and ask AI from the same evidence." />

      <section className="search-box unified-search-box">
        <div className="search-input-row">
          <input
            aria-label="Search query"
            autoComplete="off"
            enterKeyHint="search"
            inputMode="search"
            spellCheck={false}
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search or ask anything..."
          />
          <div className="search-actions">
            <button className="icon-button" disabled={isAsking} type="button" onClick={handleAsk}>
              <AskAiIcon className="ai-answer-action-icon" />
              {isAsking ? 'Asking...' : 'Ask AI'}
            </button>
            <div className="history-popover-anchor">
              <button
                aria-expanded={showHistory}
                className="icon-button secondary"
                type="button"
                onClick={() => setShowHistory((current) => !current)}
              >
                History
              </button>
              {showHistory ? (
                <AskHistoryPopover
                  historyQuery={historyQuery}
                  projects={dashboard.projects}
                  setPage={setHistoryPage}
                  onSelect={(item) => {
                    setAskAnswer({
                      question: item.question,
                      answer: item.answer,
                      projectSlug: item.projectSlug,
                      sources: item.sources,
                    });
                    setIsAnswerHidden(false);
                    setAskError(null);
                    setShowHistory(false);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
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
            onChange={(nextProjectSlug) => {
              setProjectSlug(nextProjectSlug);
              setAskAnswer(null);
              setIsAnswerHidden(false);
              setAskError(null);
            }}
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

      {isAsking ? <AskAnswerSkeleton question={searchInput.trim()} projectLabel={selectedProjectLabel} /> : null}

      {!isAsking && askAnswer && !isAnswerHidden ? (
        <Panel className="ai-answer-card-panel">
          <div className="ai-answer-toolbar">
            <button className="icon-button secondary" type="button" onClick={() => setIsAnswerHidden(true)}>
              Hide answer
            </button>
          </div>
          <AskAnswerCard item={askAnswer} openNote={openNote} projects={dashboard.projects} />
        </Panel>
      ) : null}

      {askError ? <InlineMessage className="ask-error-message" tone="error">{askError}</InlineMessage> : null}

      <div className={`knowledge-map-container-layout${sideNoteId ? ' has-drawer' : ''}`}>
        <Panel className="matching-notes-panel" style={{ minWidth: 0 }}>
          <div className="matching-notes-heading">
            <h2>Matching Notes</h2>
            <span className="matching-notes-count">{pagination ? `${pagination.total} total` : ''}</span>
          </div>
          {isResultsError ? <InlineMessage tone="error">Could not load notes for these filters.</InlineMessage> : null}
          <div className={`list ${isResultsStale ? 'stale-data' : ''}`}>
            {paginatedVisibleNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                dashboard={dashboard}
                onDelete={() => deleteNote({ id: note.id, title: note.title })}
                onEdit={() => editNote(note.id)}
                onOpen={(id) => {
                  if (isMobile || sideNoteId === id) {
                    openNote(id);
                  } else {
                    setSideNoteId(id);
                  }
                }}
                onDoubleClick={openNote}
                onPinSuccess={() => setPage(1)}
              />
            ))}
          </div>
          {pagination ? (
            isMobilePagination
              ? <MobileInfinitePagination pagination={pagination} isLoading={isResultsFetching || pagination.page > loadedMobilePage} onPageChange={setPage} />
              : <Pagination pagination={pagination} onPageChange={setPage} />
          ) : null}
          {!paginatedVisibleNotes.length && !isResultsError ? <EmptyState>No notes found with these filters.</EmptyState> : null}
        </Panel>

        {sideNoteId && (
          <SideNoteDrawer
            noteId={sideNoteId}
            dashboardProjects={dashboard.projects}
            onClose={() => setSideNoteId(null)}
            onOpenFullPage={openNote}
          />
        )}
      </div>
    </>
  );
}

function AskAnswerSkeleton({ question, projectLabel: selectedProjectLabel }: { question: string; projectLabel: string }) {
  return (
    <div className="ask-qa-card skeleton-card">
      <div className="ask-question-bubble">
        <span className="question-text">{question}</span>
        <span className="ask-project-chip">{selectedProjectLabel}</span>
      </div>
      <div className="ask-answer-container">
        <div className="ask-answer-header">
          <div className="ask-ai-identity">
            <AskAiIcon className="ask-ai-identity-icon" />
            <strong>Thinking...</strong>
          </div>
        </div>
        <div className="ask-skeleton-lines">
          <div className="skeleton-line line-1"></div>
          <div className="skeleton-line line-2"></div>
          <div className="skeleton-line line-3"></div>
        </div>
      </div>
    </div>
  );
}

function AskHistoryPopover({
  historyQuery,
  projects,
  setPage,
  onSelect,
}: {
  historyQuery: UseQueryResult<AskHistoryResponse>;
  projects: PageContext['dashboard']['projects'];
  setPage: (page: number) => void;
  onSelect: (item: AskAnswerCardItem) => void;
}) {
  const history = historyQuery.data?.history || [];

  if (historyQuery.isLoading) {
    return <div className="ask-history-popover" role="dialog"><div className="inline-message">Loading history...</div></div>;
  }

  if (historyQuery.isError) {
    return (
      <div className="ask-history-popover" role="dialog">
        <InlineMessage tone="error">Could not load Ask AI history.</InlineMessage>
      </div>
    );
  }

  if (history.length === 0) {
    return <div className="ask-history-popover" role="dialog"><div className="inline-message">No Ask AI history for this filter.</div></div>;
  }

  return (
    <div className={`ask-history-popover ${historyQuery.isPlaceholderData ? 'stale-data' : ''}`} role="dialog">
      <div className="ask-history-popover-list">
        {history.map((item) => (
          <button className="ask-history-item" key={item.id} type="button" onClick={() => onSelect(item)}>
            <span className="ask-history-question">{item.question}</span>
            <span className="ask-history-project">{projectLabel(item.projectSlug, projects)}</span>
            <span className="ask-history-answer">{item.answer}</span>
          </button>
        ))}
      </div>
      {historyQuery.data?.pagination ? (
        <Pagination compact pagination={historyQuery.data.pagination} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

function queryMatchToNoteSummary(match: {
  id: string;
  path: string;
  title: string;
  type: string;
  project: string;
  workspace: string;
  tags: string[];
  date: string;
  status: NoteStatus;
  summary: string;
  source: string;
  attachmentCount?: number;
}): NoteSummary {
  return {
    ...match,
    attachmentCount: match.attachmentCount || 0,
    folderId: null,
  };
}

function dashboardNotesPage(
  notes: NoteSummary[],
  filters: { workspaceSlug: string; projectSlug: string; status: '' | NoteStatus },
) {
  const filteredNotes = notes.filter((note) =>
    (!filters.workspaceSlug || note.workspace === filters.workspaceSlug)
    && (!filters.projectSlug || note.project === filters.projectSlug)
    && (!filters.status || note.status === filters.status),
  );

  return {
    ok: true as const,
    notes: filteredNotes.slice(0, DEFAULT_PAGE_SIZE),
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: filteredNotes.length,
      totalPages: Math.max(1, Math.ceil(filteredNotes.length / DEFAULT_PAGE_SIZE)),
      hasNext: filteredNotes.length > DEFAULT_PAGE_SIZE,
      hasPrevious: false,
    },
  };
}
