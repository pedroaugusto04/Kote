import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchNote, updateNote } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary, CanonicalNoteType } from '../../shared/api/models/note';
import { projectTimelineCategoryValues, type ProjectTimelineCategory, type ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { PaginationMeta } from '../../shared/api/models/pagination';
import { formatDisplayToken, formatUsDate, formatUsDateTime, noteTypeLabel, projectName } from '../../shared/utils/format';
import { Badge, EmptyState } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { PencilIcon, TrashIcon, ResolveIcon, ArchiveIcon } from '../../shared/ui/icons';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { type NoteStatus } from '../../shared/api/models/note-status';

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
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<{ type: 'resolve' | 'archive' } | null>(null);

  const handleResolveAll = async () => {
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
            status: 'resolved',
            canonicalType: detail.type as CanonicalNoteType,
            reminderDate: detail.editor?.reminderDate,
            reminderTime: detail.editor?.reminderTime,
            reminderAt: detail.editor?.reminderAt,
          });
        })
      );
      queryClient.invalidateQueries({ queryKey: ['project-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      alert('Failed to resolve some notes.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleArchiveAll = async () => {
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
            status: 'archived',
            canonicalType: detail.type as CanonicalNoteType,
            reminderDate: detail.editor?.reminderDate,
            reminderTime: detail.editor?.reminderTime,
            reminderAt: detail.editor?.reminderAt,
          });
        })
      );
      queryClient.invalidateQueries({ queryKey: ['project-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      alert('Failed to archive some notes.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="project-timeline">
      <div className="timeline-filter-row-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
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
        {visibleItems.length > 0 && (
          <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk({ type: 'resolve' })}>
              <ResolveIcon />
              Resolve all
            </button>
            <span style={{ color: 'var(--line-soft)', fontSize: '12px' }}>|</span>
            <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk({ type: 'archive' })}>
              <ArchiveIcon />
              Archive all
            </button>
          </div>
        )}
      </div>
      {visibleItems.length > 0 ? (
        <div className={`project-timeline-list ${isStale ? 'stale-data' : ''}`}>
          {visibleItems.map((item) => (
            <article className="project-timeline-item clickable" key={item.id} onClick={() => onOpenNote(item.noteId)} onDoubleClick={() => onOpenNoteFullPage?.(item.noteId)}>
              <div className="project-timeline-marker" aria-hidden="true" />
              <div className="project-timeline-card">
                <div className="project-timeline-meta">
                  <Badge value={formatDisplayToken(item.category)} tone={item.category} />
                  <Badge value={noteTypeLabel(item.type)} tone={item.type} />
                  <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                  <span className="meta meta-date">{formatUsDate(item.date)}</span>
                  <span className="meta meta-time"> {formatUsDateTime(item.date).split(' ')[1]}</span>
                  <span className="meta meta-project">{projectName(dashboard.projects, item.project)}</span>
                  <span className="meta meta-source">{item.source || item.sourceChannel}</span>
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
          title={confirmBulk.type === 'resolve' ? 'Resolve all items' : 'Archive all items'}
          description={
            confirmBulk.type === 'resolve'
              ? `Are you sure you want to resolve all ${visibleItems.length} notes currently listed?`
              : `Are you sure you want to archive all ${visibleItems.length} notes currently listed?`
          }
          cancelLabel="Cancel"
          confirmLabel={confirmBulk.type === 'resolve' ? 'Resolve all' : 'Archive all'}
          tone="default"
          onCancel={() => setConfirmBulk(null)}
          onConfirm={async () => {
            await (confirmBulk.type === 'resolve' ? handleResolveAll() : handleArchiveAll());
            setConfirmBulk(null);
          }}
        />
      )}
    </div>
  );
}
