import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/request';

interface QuotaExceededModalProps {
  error: ApiClientError;
  onClose: () => void;
}

export function QuotaExceededModal({ error, onClose }: QuotaExceededModalProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate('/settings/subscription');
  };

  const resourceType = error.details?.resourceType || error.code || 'Resource';
  const rawLimit = error.details?.limit;
  const rawCurrent = error.details?.current;

  const limitVal = typeof rawLimit === 'number' || typeof rawLimit === 'string' ? Number(rawLimit) : undefined;
  const currentVal = typeof rawCurrent === 'number' || typeof rawCurrent === 'string' ? Number(rawCurrent) : undefined;

  const resourceName = typeof resourceType === 'string'
    ? resourceType.charAt(0).toUpperCase() + resourceType.slice(1).replace(/_/g, ' ')
    : 'Usage';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'grid',
              placeItems: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'rgb(239, 68, 68)',
            }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 650, color: 'var(--text-strong)' }}>Quota Limit Reached</h2>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>Upgrade to unlock higher limits</p>
            </div>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        <div style={{ margin: '16px 0', fontSize: '14px', lineHeight: '1.6', color: 'var(--text)' }}>
          <p>
            You have hit the limit for <strong>{resourceName}</strong> under your current plan.
          </p>
          {(limitVal !== undefined && currentVal !== undefined) && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              background: 'var(--surface-hover)',
              border: '1px solid var(--border-subtle)',
              fontSize: '13px',
              display: 'grid',
              gap: '4px'
            }}>
              <div><strong>Limit:</strong> {limitVal === -1 ? 'Unlimited' : limitVal}</div>
              <div><strong>Current Usage:</strong> {currentVal}</div>
            </div>
          )}
        </div>

        <div className="form-actions" style={{ marginTop: '24px' }}>
          <button className="filter-chip" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="icon-button"
            style={{
              background: 'var(--primary)',
              color: 'var(--bg)',
              fontWeight: 600,
              padding: '8px 16px',
            }}
            type="button"
            onClick={handleUpgrade}
          >
            Upgrade Plan
          </button>
        </div>
      </section>
    </div>
  );
}
