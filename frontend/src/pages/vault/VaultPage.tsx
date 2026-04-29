import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { noteStatusLabel, noteTypeLabel, projectName } from '../../entities/format';
import { fetchNote } from '../../shared/api/client';
import { Badge, EmptyState, PageHead, Tags } from '../../shared/ui/primitives';
import { MarkdownView } from '../../widgets/markdown/MarkdownView';
import { NoteRow } from '../../widgets/notes/NoteRow';

export function VaultPage({ dashboard, selectedProject, selectedNoteId, openNote }: PageContext) {
  const params = useParams();
  const routeNoteId = params.noteId ? decodeURIComponent(params.noteId) : '';
  const noteId = routeNoteId || selectedNoteId;
  const notes = dashboard.notes.filter((note) => !selectedProject || note.project === selectedProject);
  const noteQuery = useQuery({ queryKey: ['note', noteId], queryFn: () => fetchNote(noteId), enabled: Boolean(noteId) });

  return (
    <>
      <PageHead title="Vault Explorer" subtitle="Arvore de arquivos, lista de documentos e leitor Markdown para exploracao rapida." />
      <div className="split">
        <aside className="document-list">
          {notes.map((note) => (
            <NoteRow key={note.id} note={note} dashboard={dashboard} onOpen={openNote} />
          ))}
        </aside>
        <article className="note-reader">
          {noteQuery.data ? (
            <>
              <header className="note-reader-head">
                <h1 className="note-title">{noteQuery.data.title}</h1>
                {isUsefulSummary(noteQuery.data.summary, noteQuery.data.title) ? <p className="note-summary">{noteQuery.data.summary}</p> : null}
                <div className="note-meta-row">
                  <Badge value={projectName(dashboard.projects, noteQuery.data.project)} tone="project" />
                  <Badge value={noteTypeLabel(noteQuery.data.type)} tone={noteQuery.data.type} />
                  <Badge value={noteStatusLabel(noteQuery.data.status)} tone={noteQuery.data.status} />
                  <span className="meta">{noteQuery.data.date}</span>
                </div>
                {noteQuery.data.tags.length ? <Tags items={noteQuery.data.tags} /> : null}
              </header>
              <MarkdownView markdown={readerMarkdown(noteQuery.data.markdown, noteQuery.data.title, noteQuery.data.summary)} />
            </>
          ) : (
            <EmptyState>Selecione uma nota para abrir o leitor.</EmptyState>
          )}
        </article>
      </div>
    </>
  );
}

function isUsefulSummary(summary: string, title: string) {
  const normalizedSummary = summary.trim().toLocaleLowerCase();
  if (!normalizedSummary) return false;
  return normalizedSummary !== title.trim().toLocaleLowerCase();
}

function readerMarkdown(markdown: string, title: string, summary: string) {
  const withoutFrontmatter = markdown.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = withoutFrontmatter.split('\n');
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ') && current.length) {
      sections.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) sections.push(current);

  return sections
    .map((section, index) => cleanReaderSection(section, { isFirst: index === 0, title, summary }))
    .flat()
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanReaderSection(section: string[], { isFirst, title, summary }: { isFirst: boolean; title: string; summary: string }) {
  const heading = section[0]?.startsWith('## ') ? section[0].slice(3).trim() : '';
  const content = heading ? section.slice(1) : section;
  const normalizedHeading = normalizeReaderText(heading);
  const meaningfulContent = content.filter((line) => line.trim());

  if (normalizedHeading === 'resumo' && sameText(meaningfulContent.join('\n'), summary)) return [];
  if (normalizedHeading === 'impacto' && sameText(meaningfulContent.join('\n'), 'No impact registered.')) return [];
  if (normalizedHeading === 'riscos' && listHasOnlyNone(meaningfulContent)) return [];
  if (normalizedHeading === 'proximos passos' && listHasOnlyNone(meaningfulContent)) return [];

  const cleanedContent = content.filter((line) => !line.startsWith('Projeto: [['));
  const withoutDuplicateTitle = isFirst ? dropDuplicateTitle(cleanedContent, title) : cleanedContent;
  if (!withoutDuplicateTitle.some((line) => line.trim())) return [];
  if (normalizedHeading === 'texto original') return withoutDuplicateTitle;

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
  return normalizeReaderText(left) === normalizeReaderText(right);
}

function normalizeReaderText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}
