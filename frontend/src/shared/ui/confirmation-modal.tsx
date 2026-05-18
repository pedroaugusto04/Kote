import { useId } from 'react';

export function ConfirmationModal({
  busy = false,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  description,
  onCancel,
  onConfirm,
  title,
  tone = 'danger',
}: {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: 'default' | 'danger';
}) {
  const titleId = useId();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-panel integration-modal confirm-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          <button aria-label="Close details" className="modal-close" type="button" onClick={onCancel}>x</button>
        </div>
        <div className="form-actions">
          <button className="filter-chip" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={tone === 'danger' ? 'icon-button danger-button' : 'icon-button'} disabled={busy} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
