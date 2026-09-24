import { useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectDecisions, exportProjectAdrsZip, type ProjectDecisionItem } from '../../shared/api/client';
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

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'current':
        return 'Accepted';
      case 'superseded':
        return 'Superseded';
      case 'rejected':
        return 'Rejected';
      case 'deprecated':
        return 'Deprecated';
      default:
        return s.toUpperCase();
    }
  };

  return (
    <div className="project-decisions-panel">
      <style>{`
        .project-decisions-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 0.25rem 0;
        }
        .decisions-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .decisions-filter-group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }
        .decisions-search-input {
          display: flex;
          align-items: center;
          background: var(--surface-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 0 0.6rem;
          gap: 0.4rem;
          min-width: 180px;
        }
        .decisions-search-input input {
          border: none;
          background: transparent;
          color: inherit;
          padding: 0.35rem 0;
          font-size: 0.85rem;
          outline: none;
          width: 100%;
        }
        .decisions-file-select {
          max-width: 200px;
          font-size: 0.85rem;
          padding: 0.35rem 0.5rem;
          background: var(--surface-secondary);
          color: inherit;
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
        }
        .decision-cards-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .decision-card {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding: 1rem 1.15rem;
          background: var(--surface-panel);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          transition: border-color 0.15s ease;
        }
        .decision-card:hover {
          border-color: var(--border-hover, var(--border-strong));
        }
        .decision-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .decision-card-badges {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .decision-kind-tag {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 2px 7px;
          border-radius: 4px;
        }
        .decision-kind-decision {
          background: rgba(59, 130, 246, 0.12);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.25);
        }
        .decision-kind-failed {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .decision-card-body {
          font-size: 0.92rem;
          line-height: 1.55;
          color: var(--text-normal);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .decision-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 0.25rem;
          padding-top: 0.6rem;
          border-top: 1px dashed var(--border-subtle);
          font-size: 0.8rem;
        }
        .decision-files-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .decision-file-chip {
          display: inline-flex;
          align-items: center;
          font-family: var(--font-mono, monospace);
          font-size: 0.75rem;
          padding: 2px 6px;
          background: var(--surface-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          color: var(--text-muted);
          cursor: pointer;
        }
        .decision-file-chip:hover {
          color: var(--text-normal);
          border-color: var(--border-hover);
        }
        .decision-note-button {
          background: transparent;
          border: none;
          color: var(--accent, #3b82f6);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .decision-note-button:hover {
          color: var(--accent-hover, #60a5fa);
        }
      `}</style>

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
                    <Badge value={getStatusLabel(item.status)} tone={getStatusBadgeTone(item.status)} />
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
