import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectTimelineCategoryValues, type ProjectTimelineCategory, type ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { PaginationMeta } from '../../shared/api/models/pagination';
import { formatDisplayToken, formatUsDateTime, noteTypeLabel, projectName } from '../../entities/format';
import { Badge, EmptyState } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';

const categoryOptions: Array<{ value: ProjectTimelineCategory; label: string }> = projectTimelineCategoryValues.map((value) => ({
  value,
  label: formatDisplayToken(value),
}));

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M11.9 1.6a1.5 1.5 0 0 1 2.1 2.1l-7.7 7.7-3.3.9.9-3.3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M9.8 3.7l2.5 2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2.8 4.2h10.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M6.2 2.7h3.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M4.1 4.2l.6 8.1h6.6l.6-8.1" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

export function ProjectTimeline({
  dashboard,
  items,
  pagination,
  category,
  onCategoryChange,
  onOpenNote,
  onEditNote,
  onDeleteNote,
  onPageChange,
}: {
  dashboard: Dashboard;
  items: ProjectTimelineItem[];
  pagination?: PaginationMeta;
  category: ProjectTimelineCategory;
  onCategoryChange: (category: ProjectTimelineCategory) => void;
  onOpenNote: (noteId: string) => void;
  onEditNote?: (note: NoteSummary) => void;
  onDeleteNote?: (note: NoteSummary) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="project-timeline">
      <div className="timeline-filter-row" role="group" aria-label="Timeline category">
        {categoryOptions.map((option) => (
          <button
            aria-pressed={category === option.value}
            className={category === option.value ? 'active' : ''}
            key={option.value}
            type="button"
            onClick={() => onCategoryChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {items.length > 0 ? (
        <div className="project-timeline-list">
          {items.map((item) => (
            <article className="project-timeline-item clickable" key={item.id} onClick={() => onOpenNote(item.noteId)}>
              <div className="project-timeline-marker" aria-hidden="true" />
              <div className="project-timeline-card">
                <div className="project-timeline-meta">
                  <Badge value={formatDisplayToken(item.category)} tone={item.category} />
                  <Badge value={noteTypeLabel(item.type)} tone={item.type} />
                  <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                  <span className="meta">{formatUsDateTime(item.date)}</span>
                  <span className="meta">{projectName(dashboard.projects, item.project)}</span>
                  <span className="meta">{item.source || item.sourceChannel}</span>
                </div>
                <div className="project-timeline-body">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                  </div>
                  <div className="row-actions">
                    {onEditNote ? (
                      <button
                        aria-label={`Edit note ${item.title}`}
                        className="row-action-button"
                        title="Edit"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditNote(item);
                        }}
                      >
                        <PencilIcon />
                      </button>
                    ) : null}
                    {onDeleteNote ? (
                      <button
                        aria-label={`Delete note ${item.title}`}
                        className="row-action-button danger"
                        title="Delete"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteNote(item);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>No timeline items for this category.</EmptyState>
      )}
      {pagination ? <Pagination pagination={pagination} onPageChange={onPageChange} /> : null}
    </div>
  );
}
