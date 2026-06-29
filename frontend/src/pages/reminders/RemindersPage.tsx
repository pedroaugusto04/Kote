import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, formatDateInUserTimeZone } from '../../shared/utils/format';
import { sortRemindersForList } from '../../shared/utils/reminders';
import { fetchReminders, bulkUpdateReminderStatuses } from '../../shared/api/client';
import { StatusFilter, NoteStatus } from '../../shared/api/models/note-status';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import type { Reminder } from '../../shared/api/models/reminder';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { Pagination } from '../../shared/ui/pagination';
import { EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';
import { ResolveIcon, ArchiveIcon } from '../../shared/ui/icons';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { KanbanPage } from '../kanban/KanbanPage';
import { RemindersViewMode, BulkReminderAction } from './enums';

const reminderStatusOptions = [
  { value: StatusFilter.Open, label: 'Open' },
  { value: StatusFilter.All, label: 'All' },
  { value: NoteStatus.Active, label: 'Active' },
  ...[NoteStatus.Pending, NoteStatus.Overdue, NoteStatus.Sent, NoteStatus.Resolved, NoteStatus.Archived].map((value) => ({
    value,
    label: formatDisplayToken(value),
  })),
];

const bulkActionConfig: Record<BulkReminderAction, {
  nextStatus: NoteStatus.Resolved | NoteStatus.Archived;
  title: string;
  confirmLabel: string;
  description: (count: number) => string;
  errorMessage: string;
}> = {
  [BulkReminderAction.Resolve]: {
    nextStatus: NoteStatus.Resolved,
    title: 'Resolve all items',
    confirmLabel: 'Resolve all',
    description: (count) => `Are you sure you want to resolve all ${count} reminders currently listed?`,
    errorMessage: 'Failed to resolve some reminders.',
  },
  [BulkReminderAction.Archive]: {
    nextStatus: NoteStatus.Archived,
    title: 'Archive all items',
    confirmLabel: 'Archive all',
    description: (count) => `Are you sure you want to archive all ${count} reminders currently listed?`,
    errorMessage: 'Failed to archive some reminders.',
  },
};

function matchesReminderStatus(reminder: Reminder, status: string) {
  const statusFilter = status || StatusFilter.Open;
  if (statusFilter === StatusFilter.All) return true;
  if (statusFilter === StatusFilter.Open) return reminder.status !== NoteStatus.Resolved && reminder.status !== NoteStatus.Archived;
  return reminder.status === statusFilter;
}

function buildInitialReminderPage(reminders: Reminder[], workspaceSlug: string, status: string) {
  const filteredReminders = sortRemindersForList(
    reminders
      .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
      .filter((reminder) => matchesReminderStatus(reminder, status)),
    status,
  );

  return {
    ok: true as const,
    reminders: filteredReminders.slice(0, DEFAULT_PAGE_SIZE),
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: filteredReminders.length,
      totalPages: Math.max(1, Math.ceil(filteredReminders.length / DEFAULT_PAGE_SIZE)),
      hasNext: filteredReminders.length > DEFAULT_PAGE_SIZE,
      hasPrevious: false,
    },
  };
}

export function RemindersPage({
  dashboard,
  selectedProject,
  selectedNoteId,
  setSelectedProject,
  openProject,
  openNote,
  editNote,
  createNote,
  deleteNote,
}: PageContext) {
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [status, setStatus] = useState(StatusFilter.Open);
  const remindersPaginationKey = `${workspaceSlug}:${status}`;
  const { page, setPage } = usePaginationState(remindersPaginationKey);
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceSlug, status, page],
    queryFn: () => fetchReminders({ page, workspaceSlug, status }),
    placeholderData: keepPreviousData,
    initialData: dashboard.reminders
      ? buildInitialReminderPage(dashboard.reminders, workspaceSlug, status)
      : undefined,
  });
  const pagination = remindersQuery.data?.pagination;
  const {
    isMobilePagination,
    loadedMobilePage,
    visibleItems: visibleReminders,
  } = useMobilePaginatedItems({
    items: remindersQuery.data?.reminders || [],
    pagination,
    resetKey: remindersPaginationKey,
    isPlaceholderData: remindersQuery.isPlaceholderData,
  });

  const queryClient = useQueryClient();
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<BulkReminderAction | null>(null);
  
  const [viewMode, setViewMode] = useState<RemindersViewMode>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return (window.localStorage.getItem('kote-reminders-view-mode') as RemindersViewMode) || RemindersViewMode.List;
      }
    } catch (e) {
      // ignore
    }
    return RemindersViewMode.List;
  });
  const [projectSlug, setProjectSlug] = useState('');

  const projectOptions = useMemo(() => [
    { value: '', label: 'All projects' },
    ...dashboard.projects
      .filter((project) => !workspaceSlug || project.workspaceSlug === workspaceSlug)
      .map((project) => ({ value: project.projectSlug, label: project.displayName })),
  ], [dashboard.projects, workspaceSlug]);

  const handleViewModeChange = (mode: RemindersViewMode) => {
    setViewMode(mode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('kote-reminders-view-mode', mode);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleProjectChange = (newProjectSlug: string) => {
    setProjectSlug(newProjectSlug);
  };

  const handleBulkUpdate = async (action: BulkReminderAction) => {
    if (!visibleReminders.length) return;
    const config = bulkActionConfig[action];
    setIsBulkUpdating(true);
    try {
      const ids = visibleReminders.map((reminder) => reminder.id);
      await bulkUpdateReminderStatuses(ids, config.nextStatus);
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      alert(config.errorMessage);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const grouped = visibleReminders.reduce<Record<string, Reminder[]>>((acc, reminder) => {
    const groupDate = reminder.reminderAt ? formatDateInUserTimeZone(reminder.reminderAt) : '';
    acc[groupDate || 'no-date'] ||= [];
    acc[groupDate || 'no-date'].push(reminder);
    return acc;
  }, {});

  return (
    <>
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>Reminders</h1>
            <div className="view-selector">
              <button
                type="button"
                className={`view-selector-btn ${viewMode === RemindersViewMode.List ? 'active' : ''}`}
                onClick={() => handleViewModeChange(RemindersViewMode.List)}
              >
                List
              </button>
              <button
                type="button"
                className={`view-selector-btn ${viewMode === RemindersViewMode.Board ? 'active' : ''}`}
                onClick={() => handleViewModeChange(RemindersViewMode.Board)}
              >
                Board
              </button>
            </div>
            {viewMode === RemindersViewMode.List ? (
              <>
                <label className="sr-only" htmlFor="reminders-page-status-select">Filter by status</label>
                <Select
                  ariaLabel="Filter by status"
                  className="page-head-select"
                  id="reminders-page-status-select"
                  options={reminderStatusOptions}
                  value={status}
                  onChange={(val) => setStatus(val as StatusFilter)}
                />
              </>
            ) : (
              <>
                <label className="sr-only" htmlFor="reminders-page-project-select">Filter by project</label>
                <Select
                  ariaLabel="Filter by project"
                  className="page-head-select"
                  id="reminders-page-project-select"
                  options={projectOptions}
                  value={projectSlug}
                  onChange={handleProjectChange}
                />
              </>
            )}
          </div>
        )}
        subtitle=""
      />
      {viewMode === RemindersViewMode.Board ? (
        <KanbanPage
          dashboard={dashboard}
          openNote={openNote}
          embedMode={true}
          projectSlug={projectSlug}
          onProjectChange={handleProjectChange}
          selectedProject={selectedProject}
          selectedNoteId={selectedNoteId}
          setSelectedProject={setSelectedProject}
          openProject={openProject}
          editNote={editNote}
          createNote={createNote}
          deleteNote={deleteNote}
        />
      ) : (
        <>
          {visibleReminders.length > 0 && (
            <div className="bulk-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk(BulkReminderAction.Resolve)}>
                <ResolveIcon />
                Resolve all
              </button>
              <span style={{ color: 'var(--line-soft)', fontSize: '12px' }}>|</span>
              <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk(BulkReminderAction.Archive)}>
                <ArchiveIcon />
                Archive all
              </button>
            </div>
          )}
          <div className={`grid ${remindersQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {Object.entries(grouped).map(([date, reminders]) => (
              <Panel key={date}>
                <h2>{date === 'no-date' ? 'No date' : formatUsDate(date)}</h2>
                <div className="list">
                  {reminders.map((reminder) => (
                    <ReminderRow key={reminder.id} reminder={reminder} dashboard={dashboard} onOpenPath={() => openNote(reminder.id)} />
                  ))}
                </div>
              </Panel>
            ))}
            {!visibleReminders.length && !remindersQuery.isLoading && !remindersQuery.isError ? (
              <EmptyState>No reminders found with these filters.</EmptyState>
            ) : null}
          </div>
          {pagination ? (
            isMobilePagination
              ? <MobileInfinitePagination pagination={pagination} isLoading={remindersQuery.isFetching || pagination.page > loadedMobilePage} onPageChange={setPage} />
              : <Pagination pagination={pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      {confirmBulk && (
        <ConfirmationModal
          busy={isBulkUpdating}
          title={bulkActionConfig[confirmBulk].title}
          description={bulkActionConfig[confirmBulk].description(visibleReminders.length)}
          cancelLabel="Cancel"
          confirmLabel={bulkActionConfig[confirmBulk].confirmLabel}
          tone="default"
          onCancel={() => setConfirmBulk(null)}
          onConfirm={async () => {
            await handleBulkUpdate(confirmBulk);
            setConfirmBulk(null);
          }}
        />
      )}
    </>
  );
}

