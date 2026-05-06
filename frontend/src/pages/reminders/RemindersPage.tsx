import { useQuery } from '@tanstack/react-query';

import type { PageContext } from '../../app/page-context';
import { formatUsDate } from '../../entities/format';
import { fetchReminders } from '../../shared/api/client';
import type { Reminder } from '../../shared/api/models/reminder';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';

export function RemindersPage({ dashboard }: PageContext) {
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const { page, setPage } = usePaginationState(workspaceSlug);
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceSlug, page],
    queryFn: () => fetchReminders({ page, workspaceSlug }),
    initialData: dashboard.reminders
      ? {
          ok: true as const,
          reminders: dashboard.reminders.filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug).slice(0, 10),
          pagination: {
            page: 1,
            pageSize: 10,
            total: dashboard.reminders.filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug).length,
            totalPages: Math.max(1, Math.ceil(dashboard.reminders.filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug).length / 10)),
            hasNext: dashboard.reminders.filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug).length > 10,
            hasPrevious: false,
          },
        }
      : undefined,
  });
  const grouped = (remindersQuery.data?.reminders || []).reduce<Record<string, Reminder[]>>((acc, reminder) => {
    acc[reminder.reminderDate || 'sem-data'] ||= [];
    acc[reminder.reminderDate || 'sem-data'].push(reminder);
    return acc;
  }, {});

  return (
    <>
      <PageHead title="Lembretes" subtitle="" />
      <div className="grid">
        {Object.entries(grouped).map(([date, reminders]) => (
          <Panel key={date}>
            <h2>{date === 'sem-data' ? date : formatUsDate(date)}</h2>
            <div className="list">
              {reminders.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} dashboard={dashboard} onOpenPath={() => undefined} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
      {remindersQuery.data ? <Pagination pagination={remindersQuery.data.pagination} onPageChange={setPage} /> : null}
    </>
  );
}
