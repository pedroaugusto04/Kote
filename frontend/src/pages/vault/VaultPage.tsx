import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName } from '../../entities/format';
import { normalizeComparableText } from '../../entities/text';
import { fetchNotes } from '../../shared/api/client';
import type { NoteAttachment, NoteSummary } from '../../shared/api/models/note';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { noteDetailQueryOptions } from '../../shared/api/note-query';
import { Badge, EmptyState, PageHead, Tags } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { MarkdownView } from '../../widgets/markdown/MarkdownView';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';

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
    window.scrollTo(0, 0);
  }, [noteId]);

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

  return (
    <>
      <PageHead title="Note details" subtitle={selectedProjectDetails?.displayName || ''} onBack={() => navigate(-1)} />
      <article className="note-reader vault-reader">
        {noteQuery.data ? (
          <>
            <header className="note-reader-head">
              <div className="note-reader-top">
                <h1 className="note-title">{noteQuery.data.title}</h1>
                <div className="note-reader-actions" aria-label="Navigation between notes">
                  <QuickNoteStatusActions note={noteQuery.data} />
                  {editNote ? (
                    <button
                      aria-label={`Edit note ${noteQuery.data.title}`}
                      className="row-action-button edit"
                      title="Edit"
                      type="button"
                      onClick={() => editNote(noteQuery.data.id)}
                    >
                      <PencilIcon />
                    </button>
                  ) : null}
                  {deleteNote ? (
                    <button
                      aria-label={`Delete note ${noteQuery.data.title}`}
                      className="row-action-button danger"
                      title="Delete"
                      type="button"
                      onClick={() => deleteNote({ id: noteQuery.data.id, title: noteQuery.data.title })}
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                  <button className="icon-button" disabled={!previousNote} type="button" onClick={() => previousNote && openNote(previousNote.id)}>
                    Previous
                  </button>
                  <button className="icon-button" disabled={!nextNote} type="button" onClick={() => nextNote && openNote(nextNote.id)}>
                    Next
                  </button>
                </div>
              </div>
              <div className="note-meta-row">
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
          </>
        ) : (
          <EmptyState>{selectedProjectDetails ? 'Open a note to start reading details.' : 'Select a project and open a note to start reading details.'}</EmptyState>
        )}
      </article>
    </>
  );
}

function NoteAttachments({ attachments }: { attachments?: NoteAttachment[] }) {
  const [activeAttachment, setActiveAttachment] = useState<NoteAttachment | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!attachments?.length) return null;

  const images = attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const files = attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));

  const isPreviewable = (attachment: NoteAttachment) => {
    if (attachment.mimeType.startsWith('image/')) {
      return true;
    }
    if (attachment.mimeType.startsWith('audio/')) {
      return true;
    }
    if (attachment.mimeType === 'application/pdf') {
      return !isMobile;
    }
    return false;
  };

  const handleAttachmentClick = (e: React.MouseEvent, attachment: NoteAttachment) => {
    if (isPreviewable(attachment)) {
      e.preventDefault();
      setActiveAttachment(attachment);
    }
  };

  return (
    <>
      <section className="note-attachments" aria-label="Attachments">
        {images.length ? (
          <div className="note-attachment-images">
            {images.map((attachment) => (
              <a
                key={attachment.id}
                className="note-attachment-image-link"
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleAttachmentClick(e, attachment)}
              >
                <img src={attachment.url} alt={attachment.fileName} loading="lazy" />
              </a>
            ))}
          </div>
        ) : null}
        {files.length ? (
          <div className="note-attachment-files">
            {files.map((attachment) => (
              <a
                key={attachment.id}
                className="note-attachment-file"
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleAttachmentClick(e, attachment)}
              >
                <span className="file-icon" aria-hidden="true">&gt;</span>
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>{attachment.mimeType} / {formatFileSize(attachment.sizeBytes)}</small>
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </section>

      {activeAttachment && (
        <div className="modal-backdrop attachment-viewer-backdrop" role="presentation" onClick={() => setActiveAttachment(null)}>
          <div
            className={`attachment-viewer-panel ${
              activeAttachment.mimeType.startsWith('image/')
                ? 'image-mode'
                : activeAttachment.mimeType.startsWith('audio/')
                ? 'audio-mode'
                : 'pdf-mode'
            }`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="attachment-viewer-header">
              <h3>{activeAttachment.fileName}</h3>
              <div className="attachment-viewer-actions">
                <a
                  href={activeAttachment.url}
                  className="filter-chip"
                  title="Open in new tab / download"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Original
                </a>
                <button
                  className="icon-button danger-button"
                  type="button"
                  onClick={() => setActiveAttachment(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="attachment-viewer-content">
              {activeAttachment.mimeType.startsWith('image/') ? (
                <img src={activeAttachment.url} alt={activeAttachment.fileName} className="attachment-viewer-image" />
              ) : activeAttachment.mimeType.startsWith('audio/') ? (
                <div className="attachment-viewer-audio-container">
                  <div className="attachment-viewer-audio-icon">
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '32px', height: '32px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                  </div>
                  <div className="attachment-viewer-audio-meta">
                    <span className="attachment-viewer-audio-title">{activeAttachment.fileName}</span>
                    <span className="attachment-viewer-audio-subtitle">{activeAttachment.mimeType} / {formatFileSize(activeAttachment.sizeBytes)}</span>
                  </div>
                  <audio src={activeAttachment.url} controls className="attachment-viewer-audio" autoPlay />
                </div>
              ) : (
                <iframe src={activeAttachment.url} title={activeAttachment.fileName} className="attachment-viewer-iframe" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
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

function NoteBody({ markdown, rawText, summary, title }: { markdown: string; rawText: string; summary: string; title: string }) {
  const extraMarkdown = readerExtraSections(markdown, title);
  const hasExtra = Boolean(extraMarkdown);
  const hasSummary = Boolean(summary) && normalizeReaderText(summary) !== normalizeReaderText(rawText);
  const showLabel = hasExtra || hasSummary;

  return (
    <div className="note-body">
      {rawText ? (
        <section className="note-body-section">
          {showLabel ? <h2 className="note-body-label">Original text</h2> : null}
          <MarkdownView markdown={rawText} />
        </section>
      ) : null}
      {hasSummary ? (
        <section className="note-body-section note-ai-summary">
          <h2 className="note-body-label">AI summary</h2>
          <MarkdownView markdown={summary} />
        </section>
      ) : null}
      {extraMarkdown ? <MarkdownView markdown={extraMarkdown} /> : null}
    </div>
  );
}

function readerExtraSections(markdown: string, title: string) {
  const withoutFrontmatter = markdown.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = withoutFrontmatter.split('\n');
  const firstSectionIndex = lines.findIndex((line) => line.startsWith('## '));
  if (firstSectionIndex === -1) return '';

  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines.slice(firstSectionIndex)) {
    if (line.startsWith('## ') && current.length) {
      sections.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) sections.push(current);

  return sections
    .map((section, index) => cleanExtraSection(section, { isFirst: index === 0, title }))
    .flat()
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanExtraSection(section: string[], { isFirst, title }: { isFirst: boolean; title: string }) {
  const heading = section[0]?.startsWith('## ') ? section[0].slice(3).trim() : '';
  const content = heading ? section.slice(1) : section;
  const normalizedHeading = normalizeReaderText(heading);
  const meaningfulContent = content.filter((line) => line.trim());

  if (normalizedHeading === 'original text') return [];
  if (normalizedHeading === 'summary') return [];
  if (normalizedHeading === 'impact' && sameText(meaningfulContent.join('\n'), 'No impact registered.')) return [];
  if (normalizedHeading === 'risks' && listHasOnlyNone(meaningfulContent)) return [];
  if (normalizedHeading === 'next steps' && listHasOnlyNone(meaningfulContent)) return [];

  const cleanedContent = content.filter((line) => !line.startsWith('Project: '));
  const withoutDuplicateTitle = isFirst ? dropDuplicateTitle(cleanedContent, title) : cleanedContent;
  if (!withoutDuplicateTitle.some((line) => line.trim())) return [];

  return heading ? [`## ${heading}`, ...withoutDuplicateTitle] : withoutDuplicateTitle;
}

function dropDuplicateTitle(lines: string[], title: string) {
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) return lines;
  const firstLine = lines[firstContentIndex].trim().replace(/^#\s+/, '');
  if (!sameText(firstLine, title)) return lines;
  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)];
}

function listHasOnlyNone(lines: string[]) {
  return lines.length > 0 && lines.every((line) => sameText(line.replace(/^-\s*/, ''), 'none'));
}

function sameText(left: string, right: string) {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function normalizeReaderText(value: string) {
  return normalizeComparableText(value);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
