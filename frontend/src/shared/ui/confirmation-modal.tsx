import { useId, useEffect } from 'react';
import { KEYBOARD_KEYS } from '../constants/keyboard.constants';
import { UI_MESSAGES } from '../constants/ui.constants';

export function ConfirmationModal({
  busy = false,
  cancelLabel = UI_MESSAGES.CANCEL,
  confirmLabel = UI_MESSAGES.CONFIRM,
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYBOARD_KEYS.ESCAPE) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);


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
          <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onCancel}>x</button>
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
