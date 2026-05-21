import type { Dashboard } from '../../shared/api/models/dashboard';
import type { Reminder } from '../../shared/api/models/reminder';
import { formatDisplayToken, projectName, reminderDisplayDateTime } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';
import { QuickNoteStatusActions } from '../notes/QuickNoteStatusActions';

export function ReminderRow({ reminder, dashboard, onOpenPath }: { reminder: Reminder; dashboard: Dashboard; onOpenPath: (path: string) => void }) {
  return (
    <article className="list-row clickable" onClick={() => onOpenPath(reminder.relativePath)}>
      <div className="list-row-body reminder-row-body">
        <div className="meta-row">
          <Badge value={formatDisplayToken(reminder.status)} tone={reminder.isOverdue ? 'high' : reminder.status} />
          <span className="meta">
            {projectName(dashboard.projects, reminder.project)} / {reminderDisplayDateTime(reminder)}
          </span>
        </div>
        <h3>{reminder.title}</h3>
      </div>
      <div className="row-actions">
        <QuickNoteStatusActions note={{ ...reminder, tags: [] }} compact />
        <span className="file-icon">T</span>
      </div>
    </article>
  );
}
