import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, formatDateInUserTimeZone } from '../../shared/utils/format';
import { sortRemindersForList } from '../../shared/utils/reminders';
import { fetchReminders, updateReminderStatus } from '../../shared/api/client';
import { StatusFilter } from '../../shared/api/models/note-status';
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

const reminderStatusOptions = [
  { value: StatusFilter.Open, label: 'Open' },
  { value: StatusFilter.All, label: 'All' },
  { value: 'active', label: 'Active' },
  ...['pending', 'overdue', 'sent', 'resolved', 'archived'].map((value) => ({
    value,
    label: formatDisplayToken(value),
  })),
];

type BulkReminderAction = 'resolve' | 'archive';
type ReminderStatus = 'resolved' | 'archived';

const bulkActionConfig: Record<BulkReminderAction, {
  nextStatus: ReminderStatus;
  title: string;
  confirmLabel: string;
  description: (count: number) => string;
  errorMessage: string;
}> = {
  resolve: {
    nextStatus: 'resolved',
    title: 'Resolve all items',
    confirmLabel: 'Resolve all',
    description: (count) => `Are you sure you want to resolve all ${count} reminders currently listed?`,
    errorMessage: 'Failed to resolve some reminders.',
  },
  archive: {
    nextStatus: 'archived',
    title: 'Archive all items',
    confirmLabel: 'Archive all',
    description: (count) => `Are you sure you want to archive all ${count} reminders currently listed?`,
    errorMessage: 'Failed to archive some reminders.',
  },
};

function matchesReminderStatus(reminder: Reminder, status: string) {
  const statusFilter = status || StatusFilter.Open;
  if (statusFilter === StatusFilter.All) return true;
  if (statusFilter === StatusFilter.Open) return reminder.status !== 'resolved' && reminder.status !== 'archived';
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

export function RemindersPage({ dashboard, openNote }: PageContext) {
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

  const handleBulkUpdate = async (action: BulkReminderAction) => {
    if (!visibleReminders.length) return;
    const config = bulkActionConfig[action];
    setIsBulkUpdating(true);
    try {
      await Promise.all(
        visibleReminders.map((reminder) => updateReminderStatus(reminder.id, config.nextStatus))
      );
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
    const groupDate = reminder.reminderAt ? formatDateInUserTimeZone(reminder.reminderAt) : reminder.reminderDate;
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
            <label className="sr-only" htmlFor="reminders-page-status-select">Filter by status</label>
            <Select
              ariaLabel="Filter by status"
              className="page-head-select"
              id="reminders-page-status-select"
              options={reminderStatusOptions}
              value={status}
              onChange={setStatus}
            />
          </div>
        )}
        subtitle=""
      />
      {visibleReminders.length > 0 && (
        <div className="bulk-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk('resolve')}>
            <ResolveIcon />
            Resolve all
          </button>
          <span style={{ color: 'var(--line-soft)', fontSize: '12px' }}>|</span>
          <button className="bulk-action-btn" type="button" disabled={isBulkUpdating} onClick={() => setConfirmBulk('archive')}>
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
