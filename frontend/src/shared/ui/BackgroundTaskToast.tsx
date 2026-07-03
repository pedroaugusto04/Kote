import type { BackgroundTask } from '../../app/global-loading';

export function BackgroundTaskToast({ task }: { task: BackgroundTask }) {
  const { label, count, total } = task;
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div
      className="bg-task-toast"
      role="status"
      aria-live="polite"
      aria-label={`${label}: ${count} of ${total}`}
    >
      <div className="bg-task-spinner" aria-hidden="true" />
      <div className="bg-task-body">
        <span className="bg-task-label">{label}</span>
        <div className="bg-task-progress-bar" aria-hidden="true">
          <div
            className="bg-task-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <span className="bg-task-count" aria-hidden="true">
        {count}<span className="bg-task-count-sep">/</span>{total}
      </span>
    </div>
  );
}
