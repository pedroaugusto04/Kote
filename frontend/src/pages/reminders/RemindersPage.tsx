import type { PageContext } from '../../app/page-context';
import type { Reminder } from '../../shared/api/models/reminder';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { ReminderRow } from '../../widgets/reminders/ReminderRow';

export function RemindersPage({ dashboard }: PageContext) {
  const grouped = dashboard.reminders.reduce<Record<string, Reminder[]>>((acc, reminder) => {
    acc[reminder.reminderDate || 'sem-data'] ||= [];
    acc[reminder.reminderDate || 'sem-data'].push(reminder);
    return acc;
  }, {});

  return (
    <>
      <PageHead title="Lembretes" subtitle="Reminders ativos e vencidos por data, projeto, status e nota original." />
      <div className="grid">
        {Object.entries(grouped).map(([date, reminders]) => (
          <Panel key={date}>
            <h2>{date}</h2>
            <div className="list">
              {reminders.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} dashboard={dashboard} onOpenPath={() => undefined} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
