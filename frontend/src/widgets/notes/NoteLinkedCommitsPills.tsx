import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjectCommits,
  linkNoteCommit,
  unlinkNoteCommit,
  type LinkedCommitSummary,
  type ProjectCommitItem,
} from '../../shared/api/client';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { notifyError, notifySuccess } from '../../shared/ui/notifications';
import { useDebouncedValue } from '../../shared/ui/use-debounced-value';
import { SearchIcon } from '../../shared/ui/icons';
import { formatUsDate, formatTimeInUserTimeZone } from '../../shared/utils/format';

interface NoteLinkedCommitsPillsProps {
  noteId?: string;
  projectSlug?: string;
  linkedCommits?: LinkedCommitSummary[];
}

function GitCommitIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '0.8rem', height: '0.8rem', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.3" />
      <line x1="1.5" y1="8" x2="5.7" y2="8" />
      <line x1="10.3" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}

export function NoteLinkedCommitsPills({
  noteId,
  projectSlug,
  linkedCommits = [],
}: NoteLinkedCommitsPillsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const canLinkCommits = Boolean(noteId && projectSlug && projectSlug !== 'inbox');

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    const handleOutsideClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const commitsQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.COMMITS(projectSlug || '', 'all', debouncedSearch, 1),
    queryFn: () =>
      fetchProjectCommits(projectSlug!, {
        page: 1,
        pageSize: 20,
        query: debouncedSearch.trim() || undefined,
      }),
    enabled: Boolean(isOpen && canLinkCommits && projectSlug),
  });

  const invalidateCommitAndNoteQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTES.ALL });
    await queryClient.invalidateQueries({ queryKey: ['note', noteId] });
    await queryClient.invalidateQueries({ queryKey: ['project-commits'] });
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECTS.ALL });
  };

  const linkMutation = useMutation({
    mutationFn: (commitIdOrSha: string) =>
      linkNoteCommit(noteId!, commitIdOrSha),
    onSuccess: async () => {
      setSearchTerm('');
      setIsOpen(false);
      notifySuccess('Commit linked to note');
      await invalidateCommitAndNoteQueries();
    },
    onError: () => {
      notifyError('Could not link commit to this note');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (commitId: string) => unlinkNoteCommit(noteId!, commitId),
    onSuccess: async () => {
      notifySuccess('Commit unlinked from note');
      await invalidateCommitAndNoteQueries();
    },
    onError: () => {
      notifyError('Could not unlink commit');
    },
  });

  if (!linkedCommits.length && !canLinkCommits) {
    return null;
  }

  const linkedIds = new Set(linkedCommits.map((c) => c.id));
  const serverCommits = (commitsQuery.data?.commits || []).filter(
    (c: ProjectCommitItem) => !linkedIds.has(c.id),
  );

  // Fast client-side filter for immediate typing response
  const queryLower = searchTerm.trim().toLowerCase();
  const filteredCommits = serverCommits.filter((c: ProjectCommitItem) => {
    if (!queryLower) return true;
    return (
      c.commitSha.toLowerCase().includes(queryLower) ||
      c.shortSha.toLowerCase().includes(queryLower) ||
      c.message.toLowerCase().includes(queryLower) ||
      c.authorName.toLowerCase().includes(queryLower) ||
      (c.branch && c.branch.toLowerCase().includes(queryLower))
    );
  });

  const isExactMatch = filteredCommits.some(
    (c) =>
      c.commitSha.toLowerCase() === queryLower ||
      c.shortSha.toLowerCase() === queryLower,
  );
  const looksLikeSha = /^[0-9a-fA-F]{7,40}$/.test(searchTerm.trim());
  const canLinkCustomSha = looksLikeSha && !isExactMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (!trimmed) return;

    if (canLinkCustomSha) {
      linkMutation.mutate(trimmed);
      return;
    }

    if (filteredCommits.length > 0) {
      linkMutation.mutate(filteredCommits[0].id);
    } else if (looksLikeSha) {
      linkMutation.mutate(trimmed);
    }
  };

  return (
    <div
      className="note-linked-commits-pills"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', position: 'relative' }}
      ref={popoverRef}
    >
      {linkedCommits.map((commit) => (
        <span
          key={commit.id}
          className="decision-file-chip note-commit-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.74rem',
            padding: '2px 7px',
          }}
          title={`${commit.shortSha}: ${commit.message}`}
        >
          <GitCommitIcon />
          {commit.htmlUrl ? (
            <a
              href={commit.htmlUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
            >
              {commit.shortSha}
            </a>
          ) : (
            <span style={{ fontWeight: 600 }}>{commit.shortSha}</span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-sans, inherit)',
              maxWidth: '160px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.85,
            }}
          >
            {commit.message}
          </span>
          {noteId && (
            <button
              type="button"
              aria-label={`Unlink commit ${commit.shortSha}`}
              title="Unlink commit"
              disabled={unlinkMutation.isPending}
              onClick={() => unlinkMutation.mutate(commit.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '0.82rem',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          )}
        </span>
      ))}

      {canLinkCommits && (
        <button
          type="button"
          className="decision-file-chip note-add-commit-btn"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.73rem',
            opacity: 0.85,
          }}
          title="Link a Git commit to this note"
        >
          <GitCommitIcon />
          <span>+ Commit</span>
        </button>
      )}

      {isOpen && canLinkCommits && (
        <div
          className="note-commit-picker-popover"
          role="dialog"
          aria-label="Link commit to note"
        >
          {/* Search box following Kote standards */}
          <form onSubmit={handleSubmit} className="note-commit-picker-search">
            <SearchIcon style={{ width: '0.85rem', height: '0.85rem', opacity: 0.65, flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search commit message, author, or SHA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search commits to link"
            />
          </form>

          {/* Action button if user types a specific commit SHA */}
          {canLinkCustomSha && (
            <button
              type="button"
              className="note-commit-picker-custom-btn"
              onClick={() => linkMutation.mutate(searchTerm.trim())}
              disabled={linkMutation.isPending}
            >
              <span>
                Link commit SHA <strong>{searchTerm.trim().slice(0, 12)}</strong>
              </span>
              <span>&rarr;</span>
            </button>
          )}

          {/* Commits List */}
          <div className="note-commit-picker-list">
            {commitsQuery.isLoading ? (
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)', padding: '8px' }}>
                Loading commits...
              </span>
            ) : filteredCommits.length === 0 ? (
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)', padding: '8px' }}>
                {searchTerm.trim()
                  ? `No commits found matching "${searchTerm.trim()}".`
                  : 'No unlinked commits found in this project.'}
              </span>
            ) : (
              filteredCommits.map((commit: ProjectCommitItem) => (
                <button
                  key={commit.id}
                  type="button"
                  className="note-commit-picker-item"
                  disabled={linkMutation.isPending}
                  onClick={() => linkMutation.mutate(commit.id)}
                  title={`Link commit: ${commit.shortSha} - ${commit.message}`}
                >
                  <code className="commit-sha">{commit.shortSha}</code>
                  <div className="commit-details">
                    <span className="commit-message">{commit.message}</span>
                    <span className="commit-meta">
                      {commit.authorName ? `${commit.authorName} • ` : ''}
                      {formatUsDate(commit.committedAt)} {formatTimeInUserTimeZone(commit.committedAt)}
                      {commit.branch ? ` • ${commit.branch}` : ''}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
