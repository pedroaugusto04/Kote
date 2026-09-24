import { useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectDecisions, exportProjectAdrsZip, getProjectDecisionStatusLabel, type ProjectDecisionItem } from '../../shared/api/client';
import { EmptyState, InlineMessage, Badge } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { DownloadIcon, SearchIcon } from '../../shared/ui/icons';
import { formatUsDate } from '../../shared/utils/format';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';
import { SourceBadge } from '../../widgets/notes/SourceBadge';

interface ProjectDecisionsPanelProps {
  projectSlug: string;
  onOpenNote?: (noteId: string) => void;
}

export function ProjectDecisionsPanel({ projectSlug, onOpenNote }: ProjectDecisionsPanelProps) {
  const [status, setStatus] = useState<string>('');
  const [kind, setKind] = useState<'all' | 'decision' | 'failed_attempt'>('all');
  const [file, setFile] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
    startTransition(() => {
      setDebouncedSearch(value);
    });
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-decisions', projectSlug, status, kind, file, debouncedSearch, page],
    queryFn: () =>
      fetchProjectDecisions(projectSlug, {
        status: status || undefined,
        kind: kind,
        file: file || undefined,
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: 15,
      }),
    enabled: Boolean(projectSlug),
  });

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await exportProjectAdrsZip(projectSlug, {
        status: status || undefined,
        kind: kind,
        file: file || undefined,
        search: debouncedSearch.trim() || undefined,
      });
      notifySuccess(`Exported living ADRs (${res.filename})`);
    } catch (err) {
      notifyError('Failed to export ADRs archive.');
      console.error('ADR export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadgeTone = (s: string) => {
    switch (s) {
      case 'current':
        return 'success';
      case 'superseded':
        return 'muted';
      case 'rejected':
      case 'deprecated':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="project-decisions-panel">
      {/* Toolbar */}
      <div className="decisions-toolbar">
        <div className="decisions-filter-group">
          {/* Status Chips */}
          <button
            type="button"
            className={status === '' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setStatus('');
              setPage(1);
            }}
          >
            All Status
          </button>
          <button
            type="button"
            className={status === 'current' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setStatus(status === 'current' ? '' : 'current');
              setPage(1);
            }}
          >
            Accepted
          </button>
          <button
            type="button"
            className={status === 'superseded' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setStatus(status === 'superseded' ? '' : 'superseded');
              setPage(1);
            }}
          >
            Superseded
          </button>
          <button
            type="button"
            className={status === 'rejected' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setStatus(status === 'rejected' ? '' : 'rejected');
              setPage(1);
            }}
          >
            Rejected
          </button>

          {/* Kind Filter */}
          <button
            type="button"
            className={kind === 'decision' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setKind(kind === 'decision' ? 'all' : 'decision');
              setPage(1);
            }}
          >
            Decisions
          </button>
          <button
            type="button"
            className={kind === 'failed_attempt' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => {
              setKind(kind === 'failed_attempt' ? 'all' : 'failed_attempt');
              setPage(1);
            }}
          >
            Failed Attempts
          </button>

          {/* File Filter Dropdown */}
          {data?.availableFiles && data.availableFiles.length > 0 && (
            <select
              aria-label="Filter by file"
              className="decisions-file-select"
              value={file}
              onChange={(e) => {
                setFile(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All files ({data.availableFiles.length})</option>
              {data.availableFiles.map((f) => (
                <option key={f} value={f} title={f}>
                  {f.split('/').pop() || f}
                </option>
              ))}
            </select>
          )}

          {/* Search Box */}
          <div className="decisions-search-input">
            <SearchIcon style={{ width: '0.85rem', height: '0.85rem', opacity: 0.6 }} />
            <input
              type="search"
              placeholder="Search decisions..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Action Group: Export ADRs */}
        <button
          className="icon-button"
          type="button"
          title="Export decisions as Architecture Decision Record (ADR) markdown files in a zip"
          onClick={handleExport}
          disabled={isExporting}
        >
          <DownloadIcon style={{ width: '0.9rem', height: '0.9rem', marginRight: '0.35rem' }} />
          {isExporting ? 'Exporting...' : 'Export ADRs (.zip)'}
        </button>
      </div>

      {/* Loading & Error States */}
      {isLoading && <EmptyState>Loading project decisions...</EmptyState>}
      {isError && (
        <InlineMessage tone="error">
          Failed to load project decisions. Please check your connection and try again.
        </InlineMessage>
      )}

      {/* Decisions List */}
      {!isLoading && !isError && (!data?.items || data.items.length === 0) && (
        <EmptyState>
          No architecture decisions recorded yet for this project. Decisions and negative hypotheses are automatically
          extracted when notes or developer sessions are synthesized.
        </EmptyState>
      )}

      {!isLoading && !isError && data?.items && data.items.length > 0 && (
        <>
          <div className="decision-cards-list">
            {data.items.map((item: ProjectDecisionItem) => (
              <article key={item.id} className="decision-card">
                <div className="decision-card-head">
                  <div className="decision-card-badges">
                    <span
                      className={`decision-kind-tag ${
                        item.kind === 'failed_attempt' ? 'decision-kind-failed' : 'decision-kind-decision'
                      }`}
                    >
                      {item.kind === 'failed_attempt' ? 'Failed Attempt' : 'Decision'}
                    </span>
                    <Badge value={getProjectDecisionStatusLabel(item.status)} tone={getStatusBadgeTone(item.status)} />
                    {item.sourceChannel && <SourceBadge source={item.sourceChannel} iconSize={14} />}
                  </div>
                  <span className="meta meta-date" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {formatUsDate(item.occurredAt)}
                  </span>
                </div>

                <div className="decision-card-body">{item.text}</div>

                <div className="decision-card-footer">
                  <div className="decision-files-row">
                    {item.files && item.files.length > 0 ? (
                      item.files.map((filePath) => (
                        <button
                          key={filePath}
                          type="button"
                          className="decision-file-chip"
                          title={`Filter by ${filePath}`}
                          onClick={() => {
                            setFile(filePath);
                            setPage(1);
                          }}
                        >
                          {filePath.split('/').pop() || filePath}
                        </button>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No linked files</span>
                    )}
                  </div>

                  {item.noteId && (
                    <button
                      type="button"
                      className="decision-note-button"
                      onClick={() => onOpenNote?.(item.noteId)}
                      title={`Open source note: ${item.noteTitle}`}
                    >
                      {item.noteTitle || 'View Source Note'} &rarr;
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {data.pagination && <Pagination pagination={data.pagination} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
