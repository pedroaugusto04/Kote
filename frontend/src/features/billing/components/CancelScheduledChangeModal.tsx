import { type ScheduledChangeDTO } from '../../../shared/api/billing';

interface CancelScheduledChangeModalProps {
  isOpen: boolean;
  scheduledChange: ScheduledChangeDTO | null | undefined;
  isPending: boolean;
  onRequestClose: () => void;
  onConfirmCancel: () => void;
}

export function CancelScheduledChangeModal({
  isOpen,
  scheduledChange,
  isPending,
  onRequestClose,
  onConfirmCancel,
}: CancelScheduledChangeModalProps) {
  if (!isOpen || !scheduledChange) return null;

  return (
    <div className="modal-backdrop" onClick={onRequestClose}>
      <section className="modal-panel integration-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Cancel Scheduled Change</h2>
            <p>Are you sure you want to cancel the scheduled plan change? Your subscription will continue as currently configured.</p>
          </div>
          <button className="modal-close" type="button" onClick={onRequestClose}>
            x
          </button>
        </div>
        <div className="form-actions">
          <button className="filter-chip" type="button" onClick={onRequestClose}>
            Keep scheduled change
          </button>
          <button
            className="filter-chip"
            style={{
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              background: 'var(--surface-danger)',
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '6px',
            }}
            disabled={isPending}
            type="button"
            onClick={onConfirmCancel}
          >
            {isPending ? 'Canceling...' : 'Yes, cancel change'}
          </button>
        </div>
      </section>
    </div>
  );
}
