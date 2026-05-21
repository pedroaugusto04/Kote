import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, formatUsDate, formatDateInUserTimeZone } from '../../entities/format';
import { fetchReminders } from '../../shared/api/client';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import type { Reminder } from '../../shared/api/models/reminder';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';

const reminderStatusOptions = ['', 'pending', 'overdue', 'sent', 'resolved', 'archived'].map((value) => ({
  value,
  label: value ? formatDisplayToken(value) : 'All statuses',
}));

function reminderTimestamp(reminder: Reminder) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${reminder.reminderDate || ''}T${reminder.reminderTime || '00:00'}:00.000Z`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.MAX_SAFE_INTEGER;
}

function sortRemindersForList(reminders: Reminder[], statusFilter: string) {
  if (statusFilter) return reminders;
  return [...reminders].sort((left, right) => {
    const leftOpenRank = reminderOpenRank(left.status);
    const rightOpenRank = reminderOpenRank(right.status);
    return leftOpenRank - rightOpenRank
      || reminderTimestamp(left) - reminderTimestamp(right)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}

function reminderOpenRank(status: string) {
  if (status === 'overdue') return 0;
  if (status === 'pending') return 1;
  return 2;
}

export function RemindersPage({ dashboard, openNote }: PageContext) {
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [status, setStatus] = useState('');
  const { page, setPage } = usePaginationState(`${workspaceSlug}:${status}`);
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceSlug, status, page],
    queryFn: () => fetchReminders({ page, workspaceSlug, status }),
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
  const grouped = (remindersQuery.data?.reminders || []).reduce<Record<string, Reminder[]>>((acc, reminder) => {
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
      <div className="grid">
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
      {remindersQuery.data ? <Pagination pagination={remindersQuery.data.pagination} onPageChange={setPage} /> : null}
    </>
  );
}
