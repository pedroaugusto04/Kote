import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, formatDateInUserTimeZone } from '../../entities/format';
import { sortRemindersForList } from '../../entities/reminders';
import { fetchReminders } from '../../shared/api/client';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import type { Reminder } from '../../shared/api/models/reminder';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';

const reminderStatusOptions = ['', 'pending', 'overdue', 'sent', 'resolved', 'archived'].map((value) => ({
  value,
  label: value ? formatDisplayToken(value) : 'All statuses',
}));

export function RemindersPage({ dashboard, openNote }: PageContext) {
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [status, setStatus] = useState('');
  const remindersPaginationKey = `${workspaceSlug}:${status}`;
  const { page, setPage } = usePaginationState(remindersPaginationKey);
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceSlug, status, page],
    queryFn: () => fetchReminders({ page, workspaceSlug, status }),
    placeholderData: keepPreviousData,
    initialData: dashboard.reminders
      ? (() => {
          const filteredReminders = sortRemindersForList(
            dashboard.reminders
              .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
              .filter((reminder) => !status || reminder.status === status),
            status,
          );
          return {
          ok: true as const,
          reminders: filteredReminders.slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: filteredReminders.length,
            totalPages: Math.max(
              1,
              Math.ceil(filteredReminders.length / DEFAULT_PAGE_SIZE),
            ),
            hasNext: filteredReminders.length > DEFAULT_PAGE_SIZE,
            hasPrevious: false,
          },
        };
        })()
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
      </div>
      {pagination ? (
        isMobilePagination
          ? <MobileInfinitePagination pagination={pagination} isLoading={remindersQuery.isFetching || pagination.page > loadedMobilePage} onPageChange={setPage} />
          : <Pagination pagination={pagination} onPageChange={setPage} />
      ) : null}
    </>
  );
}
