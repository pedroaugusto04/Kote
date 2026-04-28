import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { fetchNote } from '../../shared/api/client';
import { Badge, EmptyState, PageHead } from '../../shared/ui/primitives';
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
              <div className="meta-row">
                <Badge value={noteQuery.data.type} />
                <Badge value={noteQuery.data.status} tone={noteQuery.data.status} />
                <span className="meta">{noteQuery.data.date}</span>
              </div>
              <h1 className="note-title">{noteQuery.data.title}</h1>
              <div className="path">{noteQuery.data.path}</div>
              <MarkdownView markdown={noteQuery.data.markdown} />
            </>
          ) : (
            <EmptyState>Selecione uma nota para abrir o leitor.</EmptyState>
          )}
        </article>
      </div>
    </>
  );
}
