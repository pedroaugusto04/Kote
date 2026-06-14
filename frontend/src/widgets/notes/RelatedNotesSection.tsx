import { useQuery } from '@tanstack/react-query';
import { fetchRelatedNotes } from '../../shared/api/client';
import { Badge } from '../../shared/ui/primitives';
import { noteTypeLabel, getCleanSummary, formatUsDate } from '../../shared/utils/format';
import { SourceBadge } from './SourceBadge';

type RelatedNotesSectionProps = {
  noteId: string;
  openNote: (id: string) => void;
};

export function RelatedNotesSection({ noteId, openNote }: RelatedNotesSectionProps) {
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
          const activeSource = note.source;
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
              <SourceBadge source={activeSource} style={{ marginBottom: '6px' }} />
              <p>{getCleanSummary(note.summary)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
