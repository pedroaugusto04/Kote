import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName, getCleanSummary } from '../../entities/format';
import { fetchNotes, fetchRelatedNotes } from '../../shared/api/client';
import type { NoteAttachment, NoteSummary } from '../../shared/api/models/note';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { noteDetailQueryOptions } from '../../shared/api/note-query';
import { Badge, EmptyState, PageHead, Tags } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { NoteBody, NoteAttachments } from '../../widgets/notes/NoteReaderContent';

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
    initialData: noteId && dashboard.notes
      ? {
          ok: true as const,
          notes: dashboard.notes.filter((note) => note.project === effectiveProject).slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: dashboard.notes.filter((note) => note.project === effectiveProject).length,
            totalPages: Math.max(1, Math.ceil(dashboard.notes.filter((note) => note.project === effectiveProject).length / DEFAULT_PAGE_SIZE)),
            hasNext: dashboard.notes.filter((note) => note.project === effectiveProject).length > DEFAULT_PAGE_SIZE,
            hasPrevious: false,
          },
        }
      : undefined,
  });

  useEffect(() => {
    if (noteQuery.data?.project && noteQuery.data.project !== selectedProject) {
      setSelectedProject(noteQuery.data.project);
    }
  }, [noteQuery.data?.project, selectedProject, setSelectedProject]);

  useEffect(() => {
    const scrollToTop = () => {
      if (typeof window.scrollTo === 'function') {
        window.scrollTo(0, 0);
      }
      if (document.documentElement && typeof document.documentElement.scrollTo === 'function') {
        document.documentElement.scrollTo(0, 0);
      }
      if (document.body && typeof document.body.scrollTo === 'function') {
        document.body.scrollTo(0, 0);
      }
      
      const mainContent = document.querySelector('.content');
      if (mainContent && typeof mainContent.scrollTo === 'function') {
        mainContent.scrollTo(0, 0);
      }

      const viewContainer = document.querySelector('.view');
      if (viewContainer && typeof viewContainer.scrollTo === 'function') {
        viewContainer.scrollTo(0, 0);
      }
    };

    scrollToTop();
    const timer = setTimeout(scrollToTop, 50);
    return () => clearTimeout(timer);
  }, [noteId, noteQuery.data?.id]);

  const visibleTags = noteQuery.data ? noteQuery.data.tags.filter((tag) => tag !== noteQuery.data.project) : [];
  const notes = notesQuery.data?.notes || [];
  const pagination = notesQuery.data?.pagination;
  const currentNoteIndex = notes.findIndex((note) => note.id === noteId);
  const currentPage = pagination?.page || page;
  const currentNote = currentNoteIndex >= 0 ? notes[currentNoteIndex] : null;
  const previousNoteOnPage = currentNoteIndex > 0 ? toNavigationNote(notes[currentNoteIndex - 1]) : null;
  const nextNoteOnPage = currentNoteIndex >= 0 && currentNoteIndex < notes.length - 1 ? toNavigationNote(notes[currentNoteIndex + 1]) : null;
  const needsPreviousPage = Boolean(currentNote && currentNoteIndex === 0 && pagination?.hasPrevious && currentPage > 1);
  const needsNextPage = Boolean(currentNote && currentNoteIndex === notes.length - 1 && pagination?.hasNext);
  const previousPageQuery = useQuery({
    queryKey: ['notes', 'vault', effectiveProject, 'previous-page', currentPage],
    queryFn: () => fetchNotes({ page: currentPage - 1, projectSlug: effectiveProject }),
    enabled: Boolean(effectiveProject && needsPreviousPage),
  });
  const nextPageQuery = useQuery({
    queryKey: ['notes', 'vault', effectiveProject, 'next-page', currentPage],
    queryFn: () => fetchNotes({ page: currentPage + 1, projectSlug: effectiveProject }),
    enabled: Boolean(effectiveProject && needsNextPage),
  });
  const previousNote = previousNoteOnPage || lastNavigationNote(previousPageQuery.data?.notes);
  const nextNote = nextNoteOnPage || firstNavigationNote(nextPageQuery.data?.notes);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
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
    <>
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >

        {noteQuery.data ? (
          <>
            <header className="note-reader-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="note-meta-row" style={{ marginTop: 0 }}>
                <Badge value={projectName(dashboard.projects, noteQuery.data.project)} tone="project" />
                <Badge value={noteTypeLabel(noteQuery.data.type)} tone={noteQuery.data.type} />
                <Badge value={formatDisplayToken(noteQuery.data.status)} tone={noteQuery.data.status} />
                <span className="meta">{formatUsDate(noteQuery.data.date)}</span>
                <AttachmentIndicator count={noteQuery.data.attachmentCount || 0} />
              </div>
              {visibleTags.length ? <Tags items={visibleTags.map(formatDisplayToken)} /> : null}
            </header>
            <NoteAttachments attachments={noteQuery.data.attachments} />
            <NoteBody
              markdown={noteQuery.data.markdown}
              rawText={noteQuery.data.editor?.rawText || ''}
              summary={noteQuery.data.summary}
              title={noteQuery.data.title}
            />
            <RelatedNotesSection noteId={noteQuery.data.id} openNote={openNote} />
          </>
        ) : (
          <EmptyState>{selectedProjectDetails ? 'Open a note to start reading details.' : 'Select a project and open a note to start reading details.'}</EmptyState>
        )}
      </article>
    </>
  );
}

function RelatedNotesSection({
  noteId,
  openNote,
}: {
  noteId: string;
  openNote: (id: string) => void;
}) {
  const { data: relatedNotes, isLoading, isError } = useQuery({
    queryKey: ['notes', 'related', noteId],
    queryFn: () => fetchRelatedNotes(noteId),
    enabled: Boolean(noteId),
  });

  if (isLoading) {
    return <div className="related-notes-loading">Finding related notes...</div>;
  }

  if (isError || !relatedNotes || relatedNotes.length === 0) {
    return null;
  }

  return (
    <section className="related-notes-section" aria-label="Related notes">
      <h2 className="note-body-label">Related Notes</h2>
      <div className="related-notes-grid">
        {relatedNotes.map((note) => (
          <div
            key={note.id}
            className="related-note-card clickable"
            onClick={() => openNote(note.id)}
          >
            <div className="related-note-card-meta">
              <Badge value={noteTypeLabel(note.type)} tone={note.type} />
              <span className="meta">{formatUsDate(note.date)}</span>
            </div>
            <h4>{note.title}</h4>
            <p>{getCleanSummary(note.summary)}</p>
          </div>
        ))}
      </div>
    </section>
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


