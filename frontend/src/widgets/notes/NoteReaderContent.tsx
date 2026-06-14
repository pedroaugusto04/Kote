import { useState } from 'react';
import React from 'react';
import { createPortal } from 'react-dom';

import { normalizeComparableText, sameText, stripSourceHeader } from '../../shared/utils/text';
import { formatFileSize, formatSourceLabel, getSourceTagClass } from '../../shared/utils/format';
import type { NoteAttachment } from '../../shared/api/models/note';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { MarkdownView } from '../markdown/MarkdownView';
import { SourceIcon } from '../../shared/ui/icons';

export function NoteBody({ markdown, rawText, summary, title, source }: { markdown: string; rawText: string; summary: string; title: string; source?: string }) {
  const extraMarkdown = readerExtraSections(markdown, title);
  const hasExtra = Boolean(extraMarkdown);
  const cleanedRawText = stripSourceHeader(rawText);
  const cleanedSummary = stripSourceHeader(summary);
  const isAiNote = source ? getSourceTagClass(source) === 'ai' : false;
  const hasSummary = !isAiNote && Boolean(cleanedSummary) && normalizeReaderText(cleanedSummary) !== normalizeReaderText(cleanedRawText);
  const showLabel = hasExtra || hasSummary;
  const activeSource = source;

  return (
    <div className="note-body">
      {activeSource && (
        <div className="note-source-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', color: 'var(--muted)' }}>
          <span>Source:</span>
          <SourceIcon source={activeSource} style={{ width: '15px', height: '15px', color: 'var(--muted)' }} />
          <strong>{formatSourceLabel(activeSource)}</strong>
        </div>
      )}
      {cleanedRawText ? (
        <section className="note-body-section">
          {showLabel ? <h2 className="note-body-label">Original text</h2> : null}
          <MarkdownView markdown={cleanedRawText} />
        </section>
      ) : null}
      {hasSummary ? (
        <section className="note-body-section note-ai-summary">
          <h2 className="note-body-label">AI summary</h2>
          <MarkdownView markdown={cleanedSummary} />
        </section>
      ) : null}
      {extraMarkdown ? <MarkdownView markdown={extraMarkdown} /> : null}
    </div>
  );
}

export function NoteAttachments({ attachments }: { attachments?: NoteAttachment[] }) {
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

      {activeAttachment && createPortal(
        <div className="attachment-viewer-backdrop" role="presentation" onClick={() => setActiveAttachment(null)}>
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
                  onClick={(e) => e.stopPropagation()}
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
        </div>,
        document.body
      )}
    </>
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

function normalizeReaderText(value: string) {
  return normalizeComparableText(value);
}
