import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName, getCleanSummary, formatSourceLabel } from '../../shared/utils/format';
import type { Project } from '../../shared/api/models/project';
import { noteDetailQueryOptions } from '../../shared/api/note-query';
import { Badge, EmptyState, InlineMessage, Tags } from '../../shared/ui/primitives';
import { fetchRelatedNotes } from '../../shared/api/client';
import { AttachmentIndicator } from './AttachmentIndicator';
import { NoteBody, NoteAttachments } from './NoteReaderContent';
import { SourceIcon } from '../../shared/ui/icons';
import { extractSourceFromText } from '../../shared/utils/text';

export type SideNoteDrawerProps = {


  noteId: string;
  onClose: () => void;
  onOpenFullPage: (noteId: string) => void;
  dashboardProjects: Project[];
};

export function SideNoteDrawer({ noteId, onClose, onOpenFullPage, dashboardProjects }: SideNoteDrawerProps) {
  const noteQuery = useQuery(noteDetailQueryOptions(noteId));
  const visibleTags = noteQuery.data ? noteQuery.data.tags.filter((tag) => tag !== noteQuery.data.project) : [];
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [noteId]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);


  return (
    <aside className="knowledge-map-drawer" aria-label="Note details drawer">
      <header className="knowledge-map-drawer-head">
        <div className="knowledge-map-drawer-title-row">
          {noteQuery.data ? (
            <h2>{noteQuery.data.title}</h2>
          ) : (
            <h2>Loading note...</h2>
          )}
          <button className="icon-button danger-button knowledge-map-drawer-close" type="button" onClick={onClose} aria-label="Close drawer">
            &times;
          </button>
        </div>
        {noteQuery.data && (
          <div className="knowledge-map-drawer-actions">
            <button className="icon-button" type="button" onClick={() => onOpenFullPage(noteId)}>
              Open page
            </button>
          </div>
        )}
      </header>
      <div className="knowledge-map-drawer-content" ref={contentRef}>
        {noteQuery.isError ? (
          <InlineMessage tone="error">Could not load the note details.</InlineMessage>
        ) : noteQuery.isLoading ? (
          <div className="empty-state">Loading note details...</div>
        ) : noteQuery.data ? (
          <>
            <div className="knowledge-map-drawer-meta-row">
              <Badge value={projectName(dashboardProjects, noteQuery.data.project)} tone="project" />
              <Badge value={noteTypeLabel(noteQuery.data.type)} tone={noteQuery.data.type} />
              {noteQuery.data.source && (
                <Badge value={formatSourceLabel(noteQuery.data.source)} tone="source" />
              )}
              <Badge value={formatDisplayToken(noteQuery.data.status)} tone={noteQuery.data.status} />
              <span className="meta">{formatUsDate(noteQuery.data.date)}</span>
              <AttachmentIndicator count={noteQuery.data.attachmentCount || 0} />
            </div>
            {visibleTags.length ? <Tags items={visibleTags.map(formatDisplayToken)} /> : null}
            <NoteAttachments attachments={noteQuery.data.attachments} />
            <NoteBody
              markdown={noteQuery.data.markdown}
              rawText={noteQuery.data.editor?.rawText || ''}
              summary={noteQuery.data.summary}
              title={noteQuery.data.title}
              source={noteQuery.data.source}
            />
            <RelatedNotesSection noteId={noteQuery.data.id} openNote={onOpenFullPage} />
          </>
        ) : (
          <EmptyState>No details found.</EmptyState>
        )}
      </div>
    </aside>
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
        {relatedNotes.map((note) => {
          const activeSource = extractSourceFromText(note.summary) || note.source;
          return (
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
              {activeSource && (
                <span className={`source-tag ${getSourceTagClass(activeSource)}`} title={`Source: ${formatSourceLabel(activeSource)}`} style={{ marginBottom: '6px' }}>
                  <SourceIcon source={activeSource} />
                  <span>{formatSourceLabel(activeSource)}</span>
                </span>
              )}
              <p>{getCleanSummary(note.summary)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getSourceTagClass(source: string | null | undefined): string {
  if (!source) return 'manual';
  const normalized = source.toLowerCase().trim();
  if (normalized.includes('whatsapp') || normalized.includes('evolution')) return 'whatsapp';
  if (normalized.includes('github')) return 'github';
  if (
    normalized === 'ai-chat' ||
    normalized.includes('antigravity') ||
    normalized.includes('codex') ||
    normalized.includes('claude') ||
    normalized.includes('open-code') ||
    normalized.includes('opencode')
  ) {
    return 'ai';
  }
  if (normalized.includes('n8n') || normalized.includes('api')) return 'api';
  return 'manual';
}





