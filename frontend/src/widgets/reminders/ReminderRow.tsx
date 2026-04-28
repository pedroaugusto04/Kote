import type { Dashboard } from '../../shared/api/models/dashboard';
import type { Reminder } from '../../shared/api/models/reminder';
import { projectName } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';

export function ReminderRow({ reminder, dashboard, onOpenPath }: { reminder: Reminder; dashboard: Dashboard; onOpenPath: (path: string) => void }) {
  return (
    <article className="list-row clickable" onClick={() => onOpenPath(reminder.sourceNotePath || reminder.relativePath)}>
      <div>
        <div className="meta-row">
          <Badge value={reminder.status} tone={reminder.status} />
          <span className="meta">
            {projectName(dashboard.projects, reminder.project)} / {reminder.reminderDate} {reminder.reminderTime}
          </span>
        </div>
        <h3>{reminder.title}</h3>
      </div>
      <span className="file-icon">T</span>
    </article>
  );
}
