import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatUsDate, noteStatusLabel, noteTypeLabel, projectName } from '../../entities/format';
import { fetchNote, fetchNotes } from '../../shared/api/client';
import type { NoteSummary } from '../../shared/api/models/note';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { Badge, EmptyState, PageHead, Tags } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { MarkdownView } from '../../widgets/markdown/MarkdownView';

type NavigationNote = Pick<NoteSummary, 'id' | 'title'>;

export function VaultPage({ dashboard, selectedProject, selectedNoteId, setSelectedProject, showVaultProject, openNote }: PageContext) {
  const params = useParams();
  const routeNoteId = params.noteId ? decodeURIComponent(params.noteId) : '';
  const noteId = routeNoteId || selectedNoteId;
  const noteQuery = useQuery({ queryKey: ['note', noteId], queryFn: () => fetchNote(noteId), enabled: Boolean(noteId) });
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
      <PageHead title="Vault Explorer" subtitle="" />
      <section className="search-box vault-project-picker">
        <div className="filters">
          <select
            aria-label="Projeto das notas detalhadas"
            value={effectiveProject}
            onChange={(event) => {
              const nextProject = event.target.value;
              showVaultProject(nextProject);
            }}
          >
            {dashboard.projects.map((project) => (
              <option key={project.projectSlug} value={project.projectSlug}>
                {project.displayName}
              </option>
            ))}
          </select>
          <div className="workspace-pill workspace-pill-static" role="status" aria-label={`Projeto atual: ${selectedProjectDetails?.displayName || effectiveProject || 'nenhum'}`}>
            <span className="file-icon">P</span>
            <span className="workspace-pill-copy">
              <strong>{selectedProjectDetails?.displayName || 'Selecione um projeto'}</strong>
              <small>{selectedProjectDetails?.projectSlug || 'sem-projeto'}</small>
            </span>
          </div>
        </div>
      </section>
      <article className="note-reader vault-reader">
        {noteQuery.data ? (
          <>
            <header className="note-reader-head">
              <div className="note-reader-top">
                <h1 className="note-title">{noteQuery.data.title}</h1>
                <div className="note-reader-actions" aria-label="Navegacao entre notas">
                  <button className="icon-button" disabled={!previousNote} type="button" onClick={() => previousNote && openNote(previousNote.id)}>
                    Anterior
                  </button>
                  <button className="icon-button" disabled={!nextNote} type="button" onClick={() => nextNote && openNote(nextNote.id)}>
                    Próxima
                  </button>
                </div>
              </div>
              <div className="note-meta-row">
                <Badge value={projectName(dashboard.projects, noteQuery.data.project)} tone="project" />
                <Badge value={noteTypeLabel(noteQuery.data.type)} tone={noteQuery.data.type} />
                <Badge value={noteStatusLabel(noteQuery.data.status)} tone={noteQuery.data.status} />
                <span className="meta">{formatUsDate(noteQuery.data.date)}</span>
              </div>
              {visibleTags.length ? <Tags items={visibleTags} /> : null}
            </header>
            <MarkdownView markdown={readerMarkdown(noteQuery.data.markdown, noteQuery.data.title, noteQuery.data.summary)} />
          </>
        ) : (
          <EmptyState>{selectedProjectDetails ? `Projeto ativo: ${selectedProjectDetails.displayName}. Abra uma nota para iniciar a leitura detalhada.` : 'Selecione um projeto e abra uma nota para iniciar a leitura detalhada.'}</EmptyState>
        )}
      </article>
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
