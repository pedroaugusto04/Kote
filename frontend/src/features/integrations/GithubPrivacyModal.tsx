import { InfoIcon } from '../../shared/ui/icons';
import { InlineMessage } from '../../shared/ui/primitives';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';

interface GithubPrivacyModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export function GithubPrivacyModal({ onClose, onConfirm }: GithubPrivacyModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="github-privacy-title"
        aria-modal="true"
        className="modal-panel integration-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="card-kicker">GitHub</div>
            <h2 id="github-privacy-title">Connect GitHub Integration</h2>
          </div>
          <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        <p className="meta" style={{ marginBottom: '16px' }}>
          Kote uses official GitHub App access to passively link context to your repositories.
        </p>

        <div className="integration-card-body" style={{ marginBottom: '20px' }}>
          <p className="meta" style={{ fontWeight: 600, color: 'var(--text-color)', marginBottom: '8px' }}>
            Data Accessed:
          </p>
          <ul className="meta" style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Commit & PR Diffs (for passive context summaries)</li>
            <li>Repository file structure & paths (for Knowledge Coverage)</li>
          </ul>

          <InlineMessage
            tone="info"
            style={{
              marginTop: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.85rem',
            }}
          >
            <InfoIcon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>Raw codebase files are never cloned or stored.</span>
          </InlineMessage>
        </div>

        <div className="form-actions">
          <button className="filter-chip" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Continue to GitHub
          </button>
        </div>
      </section>
    </div>
  );
}
