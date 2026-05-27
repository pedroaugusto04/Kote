import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectTimelineCategoryValues, type ProjectTimelineCategory, type ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { PaginationMeta } from '../../shared/api/models/pagination';
import { formatDisplayToken, formatUsDateTime, noteTypeLabel, projectName } from '../../entities/format';
import { Badge, EmptyState } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';

const categoryOptions: Array<{ value: ProjectTimelineCategory; label: string }> = projectTimelineCategoryValues.map((value) => ({
  value,
  label: formatDisplayToken(value),
}));



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
  isStale = false,
  resetKey,
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
  isStale?: boolean;
  resetKey: string;
}) {
  const {
    isMobilePagination,
    loadedMobilePage,
    visibleItems,
  } = useMobilePaginatedItems({
    items,
    pagination,
    resetKey,
    isPlaceholderData: isStale,
  });

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
      {visibleItems.length > 0 ? (
        <div className={`project-timeline-list ${isStale ? 'stale-data' : ''}`}>
          {visibleItems.map((item) => (
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
                  <AttachmentIndicator count={item.attachmentCount || 0} />
                </div>
                <div className="project-timeline-body">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                  </div>
                  <div className="row-actions">
                    <QuickNoteStatusActions
                      note={{
                        id: item.noteId,
                        title: item.title,
                        status: item.status,
                        project: item.project,
                        tags: item.tags,
                      }}
                      compact
                    />
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
      {pagination ? (
        isMobilePagination
          ? <MobileInfinitePagination pagination={pagination} isLoading={isStale || pagination.page > loadedMobilePage} onPageChange={onPageChange} />
          : <Pagination pagination={pagination} onPageChange={onPageChange} />
      ) : null}
    </div>
  );
}
