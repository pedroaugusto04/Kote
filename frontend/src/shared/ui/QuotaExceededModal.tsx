import { useNavigate } from 'react-router-dom';
import { routes } from '../../app/routing/routes';
import { ApiClientError } from '../api/request';

interface QuotaExceededModalProps {
  error: ApiClientError;
  onClose: () => void;
}

export function QuotaExceededModal({
  error,
  onClose,
}: QuotaExceededModalProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate(routes.subscription);
  };

  const resourceType =
    error.details?.resourceType ||
    error.code ||
    'usage';

  const rawLimit = error.details?.limit;
  const rawCurrent = error.details?.current;

  const limitVal =
    typeof rawLimit === 'number' || typeof rawLimit === 'string'
      ? Number(rawLimit)
      : undefined;

  const currentVal =
    typeof rawCurrent === 'number' || typeof rawCurrent === 'string'
      ? Number(rawCurrent)
      : undefined;

  const resourceName =
    typeof resourceType === 'string'
      ? resourceType
        .replace(/_/g, ' ')
        .replace(/^./, (char) => char.toUpperCase())
      : 'Usage';

  const hasUsageData =
    limitVal !== undefined &&
    currentVal !== undefined &&
    Number.isFinite(limitVal) &&
    Number.isFinite(currentVal);

  const isUnlimited = limitVal === -1;

  const usagePercentage =
    hasUsageData && !isUnlimited && limitVal > 0
      ? Math.min((currentVal / limitVal) * 100, 100)
      : 100;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        aria-labelledby="quota-exceeded-title"
        aria-modal="true"
        className="modal-panel integration-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="quota-exceeded-title">
              Usage Limit Reached
            </h2>
          </div>

          <button
            aria-label="Close"
            className="modal-close"
            type="button"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '16px',
          }}
        >
          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            You have reached the available limit for{' '}
            <strong style={{
              color: 'var(--primary)',
            }}>{resourceName}</strong> on your current
            subscription plan.
          </p>

          {hasUsageData && (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-hover)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span >{resourceName}</span>

                <span>
                  {currentVal}
                  {!isUnlimited && ` / ${limitVal}`}
                </span>
              </div>

              {!isUnlimited && (
                <div
                  style={{
                    height: '8px',
                    overflow: 'hidden',
                    borderRadius: '999px',
                    background: 'var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      width: `${usagePercentage}%`,
                      height: '100%',
                      borderRadius: 'inherit',
                      background: 'var(--danger)',
                      transition: 'width 200ms ease',
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: 'var(--muted)',
                }}
              >
                {isUnlimited
                  ? 'Unlimited plan'
                  : `${currentVal} of ${limitVal} used`}
              </div>
            </div>
          )}

          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--muted)',
            }}
          >
            Upgrade your plan to increase your available{' '}
            {resourceName.toLowerCase()} quota and continue
            without interruptions.
          </p>
        </div>

        <div
          className="form-actions"
          style={{ marginTop: '24px' }}
        >
          <button
            className="filter-chip"
            type="button"
            onClick={onClose}
          >
            Close
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={handleUpgrade}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill='var(--primary)'
              aria-hidden="true"
            >
              <path d="M5 16L3 7l5 4 4-6 4 6 5-4-2 9H5z" />
            </svg>
            Upgrade Plan
          </button>
        </div>
      </section>
    </div>
  );
}