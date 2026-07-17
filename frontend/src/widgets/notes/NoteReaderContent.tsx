import { useState } from 'react';
import React from 'react';
import { createPortal } from 'react-dom';
import { normalizeComparableText, sameText, stripSourceHeader } from '../../shared/utils/text';
import { formatFileSize, SOURCE_VALUES } from '../../shared/utils/format';
import type { NoteAttachment } from '../../shared/api/models/note';
import { fetchAttachmentText } from '../../shared/api/notes';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { MarkdownView } from '../markdown/MarkdownView';
import { TypewriterMarkdown } from '../markdown/TypewriterMarkdown';
import { CDNImage } from '../../shared/ui/CDNImage';
import { SourceBadge } from './SourceBadge';
import { AiConversationView } from './AiConversationView';
import { parseAiConversationTurns } from './ai-conversation';

type AttachmentPreviewKind = 'image' | 'audio' | 'video' | 'pdf' | 'markdown' | 'text' | 'none';

type TextPreviewState = {
  attachmentId: string;
  status: 'loading' | 'loaded' | 'error';
  text: string;
};

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);
const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'log',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'sh',
  'bash',
  'zsh',
  'sql',
  'env',
  'ini',
  'conf',
  'config',
  'toml',
  'lock',
  'diff',
  'patch',
  'svg',
  'py',
  'java',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'cs',
  'php',
  'rb',
  'go',
  'rs',
]);

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/x-ndjson',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'image/svg+xml',
]);

export function NoteBody({ markdown, rawText, summary, title, source, sourceChannel }: { markdown: string; rawText: string; summary: string; title: string; source?: string; sourceChannel?: string }) {
  const extraMarkdown = readerExtraSections(markdown, title);
  const hasExtra = Boolean(extraMarkdown);
  const cleanedRawText = stripSourceHeader(rawText).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const cleanedSummary = stripSourceHeader(summary).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const isGithubPush = sourceChannel === SOURCE_VALUES.GITHUB_PUSH;
  const hasSummary = isGithubPush && Boolean(cleanedSummary) && normalizeReaderText(cleanedSummary) !== normalizeReaderText(cleanedRawText);
  const showLabel = hasExtra || hasSummary;
  const activeSource = source;
  const aiTurns = parseAiConversationTurns(cleanedRawText);
  const isAiConversation = aiTurns.length > 0;

  return (
    <div className="note-body">
      {activeSource && (
        <div style={{ marginBottom: '16px' }}>
          <SourceBadge source={activeSource} />
        </div>
      )}
      {cleanedRawText ? (
        <section className="note-body-section">
          {showLabel && !isAiConversation ? <h2 className="note-body-label">Original text</h2> : null}
          {isAiConversation
            ? <AiConversationView turns={aiTurns} />
            : <MarkdownView markdown={cleanedRawText} />}
        </section>
      ) : null}
      {hasSummary ? (
        <section className="note-body-section note-ai-summary">
          <h2 className="note-body-label">AI summary</h2>
          <TypewriterMarkdown markdown={cleanedSummary} animated={false} />
        </section>
      ) : null}
      {extraMarkdown ? <MarkdownView markdown={extraMarkdown} /> : null}
    </div>
  );
}

export function NoteAttachments({ attachments }: { attachments?: NoteAttachment[] }) {
  const [activeAttachment, setActiveAttachment] = useState<NoteAttachment | null>(null);
  const [textPreview, setTextPreview] = useState<TextPreviewState | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!attachments?.length) return null;

  const images = attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const files = attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));

  const getPreviewKind = (attachment: NoteAttachment): AttachmentPreviewKind => {
    if (attachment.mimeType.startsWith('image/')) {
      return 'image';
    }
    if (attachment.mimeType.startsWith('audio/')) {
      return 'audio';
    }
    if (attachment.mimeType.startsWith('video/')) {
      return 'video';
    }
    if (attachment.mimeType === 'application/pdf') {
      return isMobile ? 'none' : 'pdf';
    }
    if (isMarkdownAttachment(attachment)) return 'markdown';
    if (isTextAttachment(attachment)) return 'text';
    return 'none';
  };

  const handleAttachmentClick = (e: React.MouseEvent, attachment: NoteAttachment) => {
    const previewKind = getPreviewKind(attachment);
    if (previewKind !== 'none') {
      e.preventDefault();
      setActiveAttachment(attachment);
      if (previewKind === 'markdown' || previewKind === 'text') {
        setTextPreview({ attachmentId: attachment.id, status: 'loading', text: '' });
        fetchAttachmentText(attachment.url)
          .then((text) => {
            setTextPreview({ attachmentId: attachment.id, status: 'loaded', text });
          })
          .catch(() => {
            setTextPreview({ attachmentId: attachment.id, status: 'error', text: '' });
          });
      } else {
        setTextPreview(null);
      }
    }
  };

  const activePreviewKind = activeAttachment ? getPreviewKind(activeAttachment) : 'none';

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
                <CDNImage
                  src={attachment.url}
                  alt={attachment.fileName}
                  loading="lazy"
                  fallback={
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      aspectRatio: '1',
                      background: 'var(--surface-5)',
                      color: 'var(--muted)',
                      fontSize: '11px',
                      fontFamily: 'var(--mono)',
                      borderRadius: '4px',
                      animation: 'brief-skeleton-fade 1.8s infinite ease-in-out',
                    }}>
                      Loading...
                    </div>
                  }
                />
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
              activePreviewKind === 'image'
                ? 'image-mode'
                : activePreviewKind === 'audio'
                ? 'audio-mode'
                : activePreviewKind === 'video'
                ? 'video-mode'
                : activePreviewKind === 'markdown' || activePreviewKind === 'text'
                ? 'text-mode'
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
              {activePreviewKind === 'image' ? (
                <CDNImage
                  src={activeAttachment.url}
                  alt={activeAttachment.fileName}
                  className="attachment-viewer-image"
                  fallback={
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px',
                      color: 'var(--muted)',
                      fontFamily: 'var(--mono)',
                      fontSize: '13px',
                      gap: '12px',
                    }}>
                      <div className="global-loading-spinner" style={{ width: '32px', height: '32px' }} />
                      <span>Loading attachment image...</span>
                    </div>
                  }
                />
              ) : activePreviewKind === 'audio' ? (
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
              ) : activePreviewKind === 'video' ? (
                <div className="attachment-viewer-video-container">
                  <video src={activeAttachment.url} controls className="attachment-viewer-video" />
                  <div className="attachment-viewer-video-meta">
                    <span className="attachment-viewer-video-title">{activeAttachment.fileName}</span>
                    <span className="attachment-viewer-video-subtitle">{activeAttachment.mimeType} / {formatFileSize(activeAttachment.sizeBytes)}</span>
                  </div>
                </div>
              ) : activePreviewKind === 'markdown' || activePreviewKind === 'text' ? (
                <TextAttachmentPreview
                  fileName={activeAttachment.fileName}
                  kind={activePreviewKind}
                  preview={textPreview?.attachmentId === activeAttachment.id ? textPreview : null}
                />
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

function TextAttachmentPreview({
  fileName,
  kind,
  preview,
}: {
  fileName: string;
  kind: 'markdown' | 'text';
  preview: TextPreviewState | null;
}) {
  if (!preview || preview.status === 'loading') {
    return <div className="attachment-viewer-status">Loading preview...</div>;
  }

  if (preview.status === 'error') {
    return <div className="attachment-viewer-status error">Could not load this preview.</div>;
  }

  return (
    <div className="attachment-text-preview" aria-label={`Preview of ${fileName}`}>
      {kind === 'markdown' ? (
        <MarkdownView markdown={preview.text} />
      ) : (
        <pre>{preview.text}</pre>
      )}
    </div>
  );
}

function isMarkdownAttachment(attachment: NoteAttachment) {
  const mimeType = normalizedMimeType(attachment.mimeType);
  return mimeType === 'text/markdown' || mimeType === 'text/x-markdown' || MARKDOWN_EXTENSIONS.has(fileExtension(attachment.fileName));
}

function isTextAttachment(attachment: NoteAttachment) {
  const mimeType = normalizedMimeType(attachment.mimeType);
  if (mimeType.startsWith('text/')) return true;
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  return TEXT_EXTENSIONS.has(fileExtension(attachment.fileName));
}

function normalizedMimeType(mimeType: string) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

function fileExtension(fileName: string) {
  const cleanFileName = String(fileName || '').split(/[?#]/)[0].trim().toLowerCase();
  const extensionIndex = cleanFileName.lastIndexOf('.');
  if (extensionIndex === -1) return '';
  return cleanFileName.slice(extensionIndex + 1);
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
