import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchNote, updateNote, pinNote, bulkUpdateNoteStatuses } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import { projectTimelineCategoryValues, type ProjectTimelineCategory, type ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { PaginationMeta } from '../../shared/api/models/pagination';
import { formatDisplayToken, SOURCE_VALUES } from '../../shared/utils/format';
import { EmptyState } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { ResolveIcon, ArchiveIcon } from '../../shared/ui/icons';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { type NoteStatusFilter } from '../../shared/api/models/note-status';
import { BulkActionType, BulkStatusUpdate } from '../../shared/api/models/bulk-action';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { Select } from '../../shared/ui/select';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { ProjectTimelineCard } from './ProjectTimelineCard';



const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  [SOURCE_VALUES.WHATSAPP]: 'WhatsApp',
  [SOURCE_VALUES.GITHUB]: 'GitHub',
  [SOURCE_VALUES.MANUAL]: 'Manual',
  reminder: 'Reminder',
  [SOURCE_VALUES.AI_CHAT]: 'AI Chat',
};

const categoryOptions: Array<{ value: ProjectTimelineCategory; label: string }> = projectTimelineCategoryValues.map((value) => ({
  value,
  label: CATEGORY_LABELS[value] ?? formatDisplayToken(value),
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
  allowPin = true,
}: {
  dashboard: Dashboard;
  items: ProjectTimelineItem[];
  pagination?: PaginationMeta;
  category: ProjectTimelineCategory;
  onCategoryChange: (category: ProjectTimelineCategory) => void;
  status: NoteStatusFilter;
  onStatusChange: (status: NoteStatusFilter) => void;
  onOpenNote: (noteId: string) => void;
  onOpenNoteFullPage?: (noteId: string) => void;
  onEditNote?: (note: NoteSummary) => void;
  onDeleteNote?: (note: NoteSummary) => void;
  onPageChange: (page: number) => void;
  isStale?: boolean;
  resetKey: string;
  allowPin?: boolean;
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
      const ids = visibleItems.map((item) => item.noteId);
      await bulkUpdateNoteStatuses(ids, status as any);
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
          {visibleItems.map((item) => (
            <ProjectTimelineCard
              key={item.id}
              item={item}
              dashboard={dashboard}
              isPinPending={pinMutation.isPending}
              onOpen={onOpenNote}
              onOpenFullPage={onOpenNoteFullPage}
              onEdit={onEditNote}
              onDelete={onDeleteNote}
              onPin={allowPin ? (noteId, pinned) => pinMutation.mutate({ noteId, pinned }) : undefined}
            />
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
