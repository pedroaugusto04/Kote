import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchProjectCommits,
  type ProjectCommitItem,
  type LinkedCommitNoteSummary,
  type CommitLinkSource,
} from '../../shared/api/client';
import type { ProjectCommitLinkFilter } from '../../shared/api/models/project-commits';
import { EmptyState, InlineMessage } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { SearchIcon, SparklesIcon, GitHubIcon } from '../../shared/ui/icons';
import { formatUsDate, formatTimeInUserTimeZone } from '../../shared/utils/format';
import { SourceBadge } from '../../widgets/notes/SourceBadge';
import { useDebouncedValue } from '../../shared/ui/use-debounced-value';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { PROJECTS_WORKSPACE_MESSAGES } from './projects.constants';

interface ProjectCommitsPanelProps {
  projectSlug: string;
  onOpenNote?: (noteId: string) => void;
}

function formatLinkMethodBadge(method: CommitLinkSource, matchedFiles: string[]): string {
  switch (method) {
    case 'ai_terminal':
      return 'Committed by AI';
    case 'session_files':
      return matchedFiles.length > 0
        ? `${matchedFiles.length} ${matchedFiles.length === 1 ? 'file' : 'files'} modified in session`
        : 'Modified in AI session';
    case 'github_push':
      return 'GitHub push';
    case 'manual':
      return 'Manual link';
    default:
      return 'Linked';
  }
}

function GitCommitIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.5" />
      <line x1="1.5" y1="8" x2="5.5" y2="8" />
      <line x1="10.5" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}

function NoteDocIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '0.78rem', height: '0.78rem', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M3.5 2h6l3.5 3.5v8.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
      <path d="M9.5 2v3.5h3.5" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" />
      <line x1="5.5" y1="10.5" x2="8.5" y2="10.5" />
    </svg>
  );
}

export function ProjectCommitsPanel({ projectSlug, onOpenNote }: ProjectCommitsPanelProps) {
  const [linkFilter, setLinkFilter] = useState<ProjectCommitLinkFilter>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchInput, PROJECTS_WORKSPACE_MESSAGES.SEARCH.DEBOUNCE_MS);
  const [page, setPage] = useState<number>(1);
  const [expandedCommitIds, setExpandedCommitIds] = useState<Record<string, boolean>>({});

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

  const toggleFilesExpanded = (commitId: string) => {
    setExpandedCommitIds((prev) => ({ ...prev, [commitId]: !prev[commitId] }));
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.COMMITS(projectSlug, linkFilter, debouncedSearch, page),
    queryFn: () =>
      fetchProjectCommits(projectSlug, {
        linkFilter,
        query: debouncedSearch.trim() || undefined,
        page,
        pageSize: 20,
      }),
    enabled: Boolean(projectSlug),
  });

  const getEmptyMessage = () => {
    switch (linkFilter) {
      case 'ai':
        return 'No commits linked to AI sessions found for the current filters.';
      case 'github_push':
        return 'No commits linked via GitHub push found for the current filters.';
      case 'manual':
        return 'No manually linked commits found for the current filters.';
      case 'with_notes':
        return 'No commits with linked notes found for the current filters.';
      case 'all':
      default:
        return 'No Git commits synced yet. Commits are synced automatically in the background by the Kote VS Code extension or GitHub webhook.';
    }
  };

  return (
    <div className="project-decisions-panel project-commits-panel">
      {/* Toolbar */}
      <div className="decisions-toolbar" style={{ flexWrap: 'wrap', gap: '0.65rem' }}>
        <div className="decisions-filter-group" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div role="group" aria-label="Commit filter" style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={linkFilter === 'all' ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={linkFilter === 'all'}
              onClick={() => {
                setLinkFilter('all');
                setPage(1);
              }}
            >
              All Commits
            </button>
            <button
              type="button"
              className={linkFilter === 'with_notes' ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={linkFilter === 'with_notes'}
              onClick={() => {
                setLinkFilter('with_notes');
                setPage(1);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <NoteDocIcon style={{ width: '0.72rem', height: '0.72rem' }} />
              <span>With Notes</span>
            </button>
            <button
              type="button"
              className={linkFilter === 'ai' ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={linkFilter === 'ai'}
              onClick={() => {
                setLinkFilter('ai');
                setPage(1);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <SparklesIcon style={{ width: '0.75rem', height: '0.75rem' }} />
              <span>AI Sessions</span>
            </button>
            <button
              type="button"
              className={linkFilter === 'github_push' ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={linkFilter === 'github_push'}
              onClick={() => {
                setLinkFilter('github_push');
                setPage(1);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <GitHubIcon style={{ width: '0.75rem', height: '0.75rem' }} />
              <span>GitHub Pushes</span>
            </button>
            <button
              type="button"
              className={linkFilter === 'manual' ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={linkFilter === 'manual'}
              onClick={() => {
                setLinkFilter('manual');
                setPage(1);
              }}
            >
              Manual Links
            </button>
          </div>

          <div className="decisions-search-input">
            <SearchIcon style={{ width: '0.85rem', height: '0.85rem', opacity: 0.6 }} />
            <input
              type="search"
              aria-label="Search commits"
              placeholder="Search commit message, SHA, or author..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && <EmptyState>Loading project commits...</EmptyState>}
      {isError && (
        <InlineMessage tone="error">
          Failed to load project commits. Please check your connection and try again.
        </InlineMessage>
      )}

      {/* Empty State */}
      {!isLoading && !isError && (!data?.commits || data.commits.length === 0) && (
        <EmptyState>{getEmptyMessage()}</EmptyState>
      )}

      {/* Commits List */}
      {!isLoading && !isError && data?.commits && data.commits.length > 0 && (
        <>
          <div className="decision-cards-list">
            {data.commits.map((commit: ProjectCommitItem) => {
              const hasLinkedNotes = commit.linkedNotes && commit.linkedNotes.length > 0;
              const isFilesExpanded = Boolean(expandedCommitIds[commit.id]);
              const visibleFiles = isFilesExpanded ? commit.changedFiles : commit.changedFiles.slice(0, 4);
              const hiddenFilesCount = Math.max(0, commit.changedFiles.length - visibleFiles.length);

              return (
                <article
                  key={commit.id}
                  className={`decision-card commit-card ${hasLinkedNotes ? 'has-linked-notes' : ''}`}
                  style={{
                    borderLeft: hasLinkedNotes ? '3px solid var(--accent, #58a6ff)' : undefined,
                    background: hasLinkedNotes ? 'rgba(88, 166, 255, 0.04)' : undefined,
                  }}
                >
                  <div className="decision-card-head" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div className="decision-card-badges" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {commit.htmlUrl ? (
                        <a
                          href={commit.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="decision-file-chip"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 600,
                            color: 'var(--accent)',
                            textDecoration: 'none',
                          }}
                          title={`Open commit ${commit.commitSha}`}
                        >
                          <GitCommitIcon />
                          {commit.shortSha}
                        </a>
                      ) : (
                        <span
                          className="decision-file-chip"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 600,
                          }}
                          title={commit.commitSha}
                        >
                          <GitCommitIcon />
                          {commit.shortSha}
                        </span>
                      )}

                      {projectSlug === 'all' && (commit.projectName || commit.projectSlug) && (
                        <span className="decision-project-tag" title={`Project: ${commit.projectName || commit.projectSlug}`}>
                          {commit.projectName || commit.projectSlug}
                        </span>
                      )}

                      {commit.branch && (
                        <span
                          className="decision-file-chip"
                          style={{ fontSize: '0.72rem', opacity: 0.85 }}
                          title={`Branch: ${commit.branch}`}
                        >
                          {commit.branch}
                        </span>
                      )}

                      {hasLinkedNotes && (
                        <span
                          className="decision-kind-tag decision-kind-decision"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.72rem',
                            padding: '1px 6px',
                          }}
                          title={`${commit.linkedNotes.length} ${commit.linkedNotes.length === 1 ? 'linked note' : 'linked notes'}`}
                          aria-label={`${commit.linkedNotes.length} ${commit.linkedNotes.length === 1 ? 'linked note' : 'linked notes'}`}
                        >
                          <NoteDocIcon />
                          <span>{commit.linkedNotes.length}</span>
                        </span>
                      )}
                    </div>

                    <span className="meta meta-date" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {commit.authorName ? `${commit.authorName} • ` : ''}
                      {formatUsDate(commit.committedAt)} {formatTimeInUserTimeZone(commit.committedAt)}
                    </span>
                  </div>

                  <div className="decision-card-body" style={{ fontWeight: 500 }}>
                    {commit.message}
                  </div>

                  {commit.changedFiles.length > 0 && (
                    <div className="decision-files-row" style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {visibleFiles.map((filePath) => (
                        <span
                          key={filePath}
                          className="decision-file-chip"
                          title={filePath}
                          style={{ cursor: 'default' }}
                        >
                          {filePath.split('/').pop() || filePath}
                        </span>
                      ))}
                      {hiddenFilesCount > 0 && (
                        <button
                          type="button"
                          className="decision-file-chip"
                          onClick={() => toggleFilesExpanded(commit.id)}
                          title="Show all changed files"
                        >
                          +{hiddenFilesCount} more
                        </button>
                      )}
                      {isFilesExpanded && commit.changedFiles.length > 4 && (
                        <button
                          type="button"
                          className="decision-file-chip"
                          onClick={() => toggleFilesExpanded(commit.id)}
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  )}

                  {hasLinkedNotes && (
                    <div
                      className="commit-linked-notes-list"
                      style={{
                        marginTop: '0.65rem',
                        paddingTop: '0.55rem',
                        borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                      }}
                    >
                      {commit.linkedNotes.map((note: LinkedCommitNoteSummary) => (
                        <div
                          key={note.noteId}
                          onClick={() => onOpenNote?.(note.noteId)}
                          role={onOpenNote ? 'button' : undefined}
                          tabIndex={onOpenNote ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (onOpenNote && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              onOpenNote(note.noteId);
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.35rem 0.55rem',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            cursor: onOpenNote ? 'pointer' : 'default',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                            {(note.source || note.sourceChannel) && (
                              <SourceBadge source={note.source || note.sourceChannel} iconSize={14} />
                            )}
                            <span
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {note.title}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                            <span
                              className="decision-file-chip"
                              style={{ fontSize: '0.7rem', opacity: 0.85 }}
                              title={note.matchedFiles.length > 0 ? `Matched files: ${note.matchedFiles.join(', ')}` : undefined}
                            >
                              {formatLinkMethodBadge(note.linkSource, note.matchedFiles)}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>&rarr;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {data.pagination && <Pagination pagination={data.pagination} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
