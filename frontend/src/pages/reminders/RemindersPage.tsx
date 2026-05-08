import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatUsDate } from '../../entities/format';
import { fetchReminders } from '../../shared/api/client';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import type { Reminder } from '../../shared/api/models/reminder';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';

export function RemindersPage({ dashboard }: PageContext) {
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [status, setStatus] = useState('');
  const { page, setPage } = usePaginationState(`${workspaceSlug}:${status}`);
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceSlug, status, page],
    queryFn: () => fetchReminders({ page, workspaceSlug, status }),
    initialData: dashboard.reminders
      ? {
          ok: true as const,
          reminders: dashboard.reminders
            .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
            .filter((reminder) => !status || reminder.status === status)
            .slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: dashboard.reminders
              .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
              .filter((reminder) => !status || reminder.status === status)
              .length,
            totalPages: Math.max(
              1,
              Math.ceil(
                dashboard.reminders
                  .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
                  .filter((reminder) => !status || reminder.status === status)
                  .length / DEFAULT_PAGE_SIZE,
              ),
            ),
            hasNext: dashboard.reminders
              .filter((reminder) => !workspaceSlug || reminder.workspace === workspaceSlug)
              .filter((reminder) => !status || reminder.status === status)
              .length > DEFAULT_PAGE_SIZE,
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
      <section className="filters">
        <select aria-label="Filtrar por situação" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todas as situações</option>
          <option value="active">Ativos</option>
          <option value="expired">Vencidos</option>
          <option value="sent">Enviados</option>
          <option value="resolved">Resolvidos</option>
          <option value="archived">Arquivados</option>
        </select>
      </section>
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
