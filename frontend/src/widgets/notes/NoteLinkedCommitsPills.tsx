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
  const [commitShaInput, setCommitShaInput] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const canLinkCommits = Boolean(noteId && projectSlug && projectSlug !== 'inbox');

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const recentCommitsQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.COMMITS(projectSlug || '', false, '', 1),
    queryFn: () => fetchProjectCommits(projectSlug!, { page: 1, pageSize: 15 }),
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
      setCommitShaInput('');
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
  const availableCommits = (recentCommitsQuery.data?.commits || []).filter(
    (c: ProjectCommitItem) => !linkedIds.has(c.id),
  );

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
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 40,
            width: '320px',
            maxWidth: '90vw',
            background: 'var(--bg-elevated, #161b22)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.14))',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = commitShaInput.trim();
              if (!trimmed) return;
              const matched = availableCommits.find(
                (c: ProjectCommitItem) =>
                  c.commitSha.startsWith(trimmed) || c.shortSha === trimmed || c.id === trimmed,
              );
              linkMutation.mutate(matched ? matched.id : trimmed);
            }}
            style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}
          >
            <input
              type="text"
              placeholder="Paste commit SHA..."
              value={commitShaInput}
              onChange={(e) => setCommitShaInput(e.target.value)}
              style={{
                flex: 1,
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '5px',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.14))',
                background: 'var(--bg-surface, #0d1117)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              className="filter-chip active"
              disabled={!commitShaInput.trim() || linkMutation.isPending}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              Link
            </button>
          </form>

          <div
            style={{
              maxHeight: '190px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {recentCommitsQuery.isLoading ? (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '4px' }}>
                Loading recent commits...
              </span>
            ) : availableCommits.length === 0 ? (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '4px' }}>
                No unlinked recent commits found in this project.
              </span>
            ) : (
              availableCommits.map((commit: ProjectCommitItem) => (
                <button
                  key={commit.id}
                  type="button"
                  disabled={linkMutation.isPending}
                  onClick={() => linkMutation.mutate(commit.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textAlign: 'left',
                    padding: '5px 6px',
                    borderRadius: '5px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                  }}
                >
                  <code style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                    {commit.shortSha}
                  </code>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {commit.message}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
