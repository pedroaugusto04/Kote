import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName, formatSourceLabel } from '../../shared/utils/format';
import { fetchNotes } from '../../shared/api/client';
import type { NoteAttachment, NoteSummary } from '../../shared/api/models/note';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { noteDetailQueryOptions } from '../../shared/api/note-query';
import { Badge, EmptyState, PageHead, Tags } from '../../shared/ui/primitives';
import { buildNoteDisplayTags } from '../../shared/utils/note-tags';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { NoteBody, NoteAttachments } from '../../widgets/notes/NoteReaderContent';
import { RelatedNotesSection } from '../../widgets/notes/RelatedNotesSection';

type NavigationNote = Pick<NoteSummary, 'id' | 'title'>;

export function VaultPage({
  dashboard,
  selectedProject,
  selectedNoteId,
  setSelectedProject,
  openNote,
  editNote,
  deleteNote,
}: PageContext) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();
  const params = useParams();
  const routeNoteId = params.noteId ? decodeURIComponent(params.noteId) : '';
  const noteId = routeNoteId || selectedNoteId;
  const noteQuery = useQuery(noteDetailQueryOptions(noteId));
  const effectiveProject = noteQuery.data?.project || selectedProject;
  const selectedProjectDetails = useMemo(
    () => dashboard.projects.find((project) => project.projectSlug === effectiveProject) || null,
    [dashboard.projects, effectiveProject],
  );
  const { page } = usePaginationState(`${effectiveProject}:${noteId}`);
  const notesQuery = useQuery({
    queryKey: ['notes', 'vault', effectiveProject, noteId, page],
    queryFn: () => fetchNotes({ page, projectSlug: effectiveProject, selectedId: noteId }),
    enabled: Boolean(noteId && effectiveProject),
  });
  const [contentOpacity, setContentOpacity] = useState(1);

  useEffect(() => {
    if (noteQuery.data?.project && noteQuery.data.project !== selectedProject) {
      setSelectedProject(noteQuery.data.project);
    }
  }, [noteQuery.data?.project, selectedProject, setSelectedProject]);

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      
      const content = document.querySelector('.content');
      const view = document.querySelector('.view');
      
      if (content && typeof (content as HTMLElement).scrollTo === 'function') {
        (content as HTMLElement).scrollTop = 0;
      }
      
      if (view && typeof (view as HTMLElement).scrollTo === 'function') {
        (view as HTMLElement).scrollTop = 0;
      }
    };

    setContentOpacity(0);
    scrollToTop();
    
    const timer = setTimeout(() => {
      setContentOpacity(1);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [noteId, noteQuery.data?.id]);

  const visibleTags = noteQuery.data ? buildNoteDisplayTags({ tags: noteQuery.data.tags, categories: noteQuery.data.categories }) : [];
  const previousNote = noteQuery.data?.navigation?.previous || null;
  const nextNote = noteQuery.data?.navigation?.next || null;

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setSwipeDirection(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.targetTouches[0].clientX;
    setTouchEnd(currentX);
    
    if (touchStart) {
      const distance = touchStart - currentX;
      if (distance > 20) {
        setSwipeDirection('left');
      } else if (distance < -20) {
        setSwipeDirection('right');
      } else {
        setSwipeDirection(null);
      }
    }
  };

  const handleTouchEnd = () => {
    setSwipeDirection(null);
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    if (isLeftSwipe && nextNote) {
      openNote(nextNote.id);
    } else if (isRightSwipe && previousNote) {
      openNote(previousNote.id);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative' }}
    >
      {isMobile && swipeDirection && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            [swipeDirection === 'left' ? 'right' : 'left']: '20px',
            transform: 'translateY(-50%)',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--surface-hover-accent)',
            border: '1px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--active-text)',
            opacity: 0.8,
            pointerEvents: 'none',
            zIndex: 1000,
            transition: 'opacity 150ms ease',
          }}
        >
          {swipeDirection === 'left' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          )}
        </div>
      )}
      <PageHead
        title={noteQuery.data?.title || 'Note details'}
        subtitle={selectedProjectDetails?.displayName || ''}
        onBack={() => navigate(-1)}
        action={
          noteQuery.data ? (
            <div className="note-reader-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QuickNoteStatusActions note={noteQuery.data} />
              {editNote && (
                <button
                  aria-label={`Edit note ${noteQuery.data.title}`}
                  className="row-action-button edit"
                  title="Edit"
                  type="button"
                  onClick={() => editNote(noteQuery.data.id)}
                >
                  <PencilIcon />
                </button>
              )}
              {deleteNote && (
                <button
                  aria-label={`Delete note ${noteQuery.data.title}`}
                  className="row-action-button danger"
                  title="Delete"
                  type="button"
                  onClick={() => deleteNote({ id: noteQuery.data.id, title: noteQuery.data.title })}
                >
                  <TrashIcon />
                </button>
              )}
              {!isMobile && (
                <div style={{ display: 'inline-flex', gap: '6px', marginLeft: '6px' }}>
                  <button className="icon-button" disabled={!previousNote} type="button" onClick={() => previousNote && openNote(previousNote.id)}>
                    Previous
                  </button>
                  <button className="icon-button" disabled={!nextNote} type="button" onClick={() => nextNote && openNote(nextNote.id)}>
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
      />
      <article
        className="note-reader vault-reader"
        style={{ opacity: contentOpacity, transition: 'opacity 200ms ease' }}
      >

        {noteQuery.data ? (
          <>
            <header className="note-reader-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="note-meta-row" style={{ marginTop: 0 }}>
                <span className="meta">{formatUsDate(noteQuery.data.date)}</span>
                <AttachmentIndicator count={noteQuery.data.attachmentCount || 0} />
                <Badge value={formatDisplayToken(noteQuery.data.status)} tone={noteQuery.data.status} />
              </div>
              {visibleTags.length ? <Tags items={visibleTags} /> : null}
            </header>
            <NoteAttachments attachments={noteQuery.data.attachments} />
            <NoteBody
              markdown={noteQuery.data.markdown}
              rawText={noteQuery.data.editor?.rawText || ''}
              summary={noteQuery.data.summary}
              title={noteQuery.data.title}
              source={noteQuery.data.source}
            />
            <RelatedNotesSection noteId={noteQuery.data.id} openNote={openNote} />
          </>
        ) : (
          <EmptyState>{selectedProjectDetails ? 'Open a note to start reading details.' : 'Select a project and open a note to start reading details.'}</EmptyState>
        )}
      </article>
    </div>
  );
}









function toNavigationNote(note: NoteSummary | undefined): NavigationNote | null {
  return note ? { id: note.id, title: note.title } : null;
}

function firstNavigationNote(notes: NoteSummary[] | undefined): NavigationNote | null {
  return toNavigationNote(notes?.[0]);
}

function lastNavigationNote(notes: NoteSummary[] | undefined): NavigationNote | null {
  return toNavigationNote(notes?.at(-1));
}
