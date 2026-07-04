import { useState } from 'react';
import type { BackgroundTask } from '../../app/global-loading';
import { ConfirmationModal } from './confirmation-modal';
import { INTEGRATION_MESSAGES } from '../../features/integrations/integrations.constants';

export function BackgroundTaskToast({ task }: { task: BackgroundTask }) {
  const { label, count, total, onCancel } = task;
  const [showConfirm, setShowConfirm] = useState(false);
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  const handleConfirm = () => {
    setShowConfirm(false);
    onCancel?.();
  };

  return (
    <>
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
        {onCancel && (
          <button
            type="button"
            className="bg-task-cancel-btn"
            onClick={() => setShowConfirm(true)}
            aria-label="Cancel background task"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-soft)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              lineHeight: '1',
              padding: '0 4px',
              marginLeft: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'stretch',
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-soft)'; }}
          >
            &times;
          </button>
        )}
      </div>

      {showConfirm && (
        <ConfirmationModal
          title={INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_TITLE}
          description={INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_DESCRIPTION}
          confirmLabel={INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_CONFIRM}
          cancelLabel={INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_KEEP}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
