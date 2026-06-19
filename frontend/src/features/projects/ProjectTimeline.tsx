import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchNote, updateNote, pinNote } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectTimelineCategoryValues, type ProjectTimelineCategory, type ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { PaginationMeta } from '../../shared/api/models/pagination';
import { formatDisplayToken, formatUsDate, formatUsDateTime, noteTypeLabel, projectName, getCleanSummary } from '../../shared/utils/format';
import { Badge, EmptyState } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { PencilIcon, TrashIcon, ResolveIcon, ArchiveIcon } from '../../shared/ui/icons';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { SourceBadge } from '../../widgets/notes/SourceBadge';
import { type NoteStatus } from '../../shared/api/models/note-status';
import { BulkActionType, BulkStatusUpdate } from '../../shared/api/models/bulk-action';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { Select } from '../../shared/ui/select';
import { useMediaQuery } from '../../shared/ui/use-media-query';

function PinIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.91a2 2 0 0 1-.43-1.24V5a2 2 0 0 0-2-2h-3.6a2 2 0 0 0-2 2v4.85a2 2 0 0 1-.43 1.24l-2.33 2.91a2 2 0 0 0-.44 1.24z" />
    </svg>
  );
}

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
  status,
  onStatusChange,
  onOpenNote,
  onOpenNoteFullPage,
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
  status: '' | 'open' | NoteStatus;
  onStatusChange: (status: '' | 'open' | NoteStatus) => void;
  onOpenNote: (noteId: string) => void;
  onOpenNoteFullPage?: (noteId: string) => void;
  onEditNote?: (note: NoteSummary) => void;
  onDeleteNote?: (note: NoteSummary) => void;
  onPageChange: (page: number) => void;
  isStale?: boolean;
  resetKey: string;
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
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

  const queryClient = useQueryClient();
  const pinMutation = useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) => pinNote(noteId, pinned),
    onSuccess: async (_, { pinned }) => {
      notifySuccess(pinned ? UI_MESSAGES.NOTE_PINNED : UI_MESSAGES.NOTE_UNPINNED);
      await invalidateNoteRelatedQueries(queryClient);
    },
    onError: (error) => {
      notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_TOGGLE_PIN_STATUS);
    },
  });
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<{ type: BulkActionType } | null>(null);

  const handleBulkStatusUpdate = async (status: BulkStatusUpdate) => {
    if (!visibleItems.length) return;
    setIsBulkUpdating(true);
    try {
      await Promise.all(
        visibleItems.map(async (item) => {
          const detail = await fetchNote(item.noteId);
          return updateNote(item.noteId, {
            folderId: detail.folderId || '',
            title: detail.title,
            rawText: detail.editor?.rawText || '',
            tags: detail.tags,
            status,
            reminderDate: detail.editor?.reminderDate,
            reminderTime: detail.editor?.reminderTime,
            reminderAt: detail.editor?.reminderAt,
          });
        })
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECTS.ALL });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTES.ALL });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD });
    } catch (err) {
      console.error(err);
      alert(`Failed to ${status} some notes.`);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleResolveAll = () => handleBulkStatusUpdate(BulkStatusUpdate.Resolved);
  const handleArchiveAll = () => handleBulkStatusUpdate(BulkStatusUpdate.Archived);

  return (
    <div className="project-timeline">
      <div className="timeline-filter-row-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        {isMobile ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="sr-only" htmlFor="timeline-category-select">Filter by category</label>
            <Select
              ariaLabel="Filter by category"
              id="timeline-category-select"
              options={categoryOptions}
              value={category}
              onChange={(value) => onCategoryChange(value as ProjectTimelineCategory)}
            />
          </div>
        ) : (
          <div className="timeline-filter-row" role="group" aria-label="Timeline category" style={{ margin: 0 }}>
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
        )}
        {visibleItems.length > 0 && (
          <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk({ type: BulkActionType.Resolve })}>
              <ResolveIcon />
              Resolve all
            </button>
            <span style={{ color: 'var(--line-soft)', fontSize: '12px' }}>|</span>
            <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk({ type: BulkActionType.Archive })}>
              <ArchiveIcon />
              Archive all
            </button>
          </div>
        )}
      </div>
      {visibleItems.length > 0 ? (
        <div className={`project-timeline-list ${isStale ? 'stale-data' : ''}`}>
          {visibleItems.map((item) => {
            const activeSource = item.source || item.sourceChannel;
            return (
              <article className="project-timeline-item clickable" key={item.id} onClick={() => onOpenNote(item.noteId)} onDoubleClick={() => onOpenNoteFullPage?.(item.noteId)}>
                <div className="project-timeline-marker" aria-hidden="true" />
                <div className="project-timeline-card">
                  <div className="project-timeline-meta">
                    {item.isPinned && (
                      <span className="pinned-badge" title="Pinned Note" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--amber)', fontSize: '11px', fontWeight: 'bold' }}>
                        <PinIcon active /> Pinned
                      </span>
                    )}
                    <Badge value={formatDisplayToken(item.category)} tone={item.category} />
                    <Badge value={noteTypeLabel(item.type)} tone={item.type} />
                    <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                    <span className="meta meta-date">{formatUsDate(item.date)}</span>
                    <span className="meta meta-time"> {formatUsDateTime(item.date).split(' ')[1]}</span>
                    <span className="meta meta-project">{projectName(dashboard.projects, item.project)}</span>
                    <AttachmentIndicator count={item.attachmentCount || 0} />
                  </div>
                  <button
                    aria-label={item.isPinned ? `Unpin note ${item.title}` : `Pin note ${item.title}`}
                    className={`row-action-button pin ${item.isPinned ? 'active' : ''}`}
                    title={item.isPinned ? 'Unpin' : 'Pin'}
                    type="button"
                    disabled={pinMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      pinMutation.mutate({ noteId: item.noteId, pinned: !item.isPinned });
                    }}
                    style={{
                      position: 'absolute',
                      top: '14px',
                      right: '14px',
                      zIndex: 2,
                    }}
                  >
                    <PinIcon active={item.isPinned} />
                  </button>
                  <div className="project-timeline-body">
                    <div>
                      <h3>{item.title}</h3>
                      <SourceBadge source={activeSource} />
                      <p>{getCleanSummary(item.summary)}</p>
                    </div>
                    <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end', marginTop: 'auto' }}>
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
                          className="row-action-button edit"
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
            );
          })}
        </div>
      ) : (
        <EmptyState>No timeline items for this category.</EmptyState>
      )}
      {pagination ? (
        isMobilePagination
          ? <MobileInfinitePagination pagination={pagination} isLoading={isStale || pagination.page > loadedMobilePage} onPageChange={onPageChange} />
          : <Pagination pagination={pagination} onPageChange={onPageChange} />
      ) : null}

      {confirmBulk && (
        <ConfirmationModal
          busy={isBulkUpdating}
          title={confirmBulk.type === BulkActionType.Resolve ? 'Resolve all items' : 'Archive all items'}
          description={
            confirmBulk.type === BulkActionType.Resolve
              ? `Are you sure you want to resolve all ${visibleItems.length} notes currently listed?`
              : `Are you sure you want to archive all ${visibleItems.length} notes currently listed?`
          }
          cancelLabel="Cancel"
          confirmLabel={confirmBulk.type === BulkActionType.Resolve ? 'Resolve all' : 'Archive all'}
          tone="default"
          onCancel={() => setConfirmBulk(null)}
          onConfirm={async () => {
            await (confirmBulk.type === BulkActionType.Resolve ? handleResolveAll() : handleArchiveAll());
            setConfirmBulk(null);
          }}
        />
      )}
    </div>
  );
}


