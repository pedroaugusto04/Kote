import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';

import { formatDisplayToken, formatUsDate, noteTypeLabel, projectName } from '../../entities/format';
import { normalizeComparableText } from '../../entities/text';
import type { NoteAttachment } from '../../shared/api/models/note';
import type { Project } from '../../shared/api/models/project';
import { noteDetailQueryOptions } from '../../shared/api/note-query';
import { Badge, EmptyState, InlineMessage, Tags } from '../../shared/ui/primitives';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { MarkdownView } from '../markdown/MarkdownView';
import { AttachmentIndicator } from './AttachmentIndicator';

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
            />
          </>
        ) : (
          <EmptyState>No details found.</EmptyState>
        )}
      </div>
    </aside>
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
            className={`attachment-viewer-panel ${activeAttachment.mimeType.startsWith('image/') ? 'image-mode' : 'pdf-mode'}`}
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
