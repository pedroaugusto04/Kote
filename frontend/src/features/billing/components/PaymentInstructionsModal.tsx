import { type PendingPaymentDTO } from '../../../shared/api/billing';
import { BILLING_TYPE } from '../../../shared/constants/billing.constants';

interface PaymentInstructionsModalProps {
  isOpen: boolean;
  activePayment: PendingPaymentDTO | null;
  isPaymentCloseConfirmOpen: boolean;
  copied: boolean;
  onRequestClose: () => void;
  onCloseConfirm: () => void;
  onKeepOpen: () => void;
  onCopyPix: () => void;
  onConfirmStripePayment: (payment: PendingPaymentDTO) => void;
  formatCurrency: (val: number) => string;
}

export function PaymentInstructionsModal({
  isOpen,
  activePayment,
  isPaymentCloseConfirmOpen,
  copied,
  onRequestClose,
  onCloseConfirm,
  onKeepOpen,
  onCopyPix,
  onConfirmStripePayment,
  formatCurrency,
}: PaymentInstructionsModalProps) {
  if (!isOpen || !activePayment) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onRequestClose}>
        <section className="modal-panel integration-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>Payment instructions</h2>
              <p>Complete the payment of {formatCurrency(activePayment.value)} to activate your subscription</p>
            </div>
            <button className="modal-close" type="button" onClick={onRequestClose}>
              x
            </button>
          </div>

          <div style={{ margin: '20px 0' }}>
            {activePayment.billingType === 'pix' && (
              <div className="payment-qr-container">
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Scan QR Code via your bank app:</span>

                {activePayment.pixQrCodeUrl && (
                  <div className="qr-code-image">
                    <img src={activePayment.pixQrCodeUrl} alt="PIX QR Code" width="160" height="160" />
                  </div>
                )}

                <span style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                  Or copy the PIX code below:
                </span>

                <div className="pix-copy-box">
                  <input
                    readOnly
                    type="text"
                    className="pix-copy-input"
                    value={activePayment.pixQrCode || ''}
                    aria-label="PIX Copy Paste Code"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="profile-connection-btn"
                    onClick={onCopyPix}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {activePayment.billingType === BILLING_TYPE.CREDIT_CARD && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '24px 0' }}>
                <svg width="64" height="40" viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="0.5" y="0.5" width="63" height="39" rx="4.5" fill="#1E293B" stroke="#334155" strokeWidth="1" />
                  <rect x="4" y="12" width="56" height="8" rx="2" fill="#475569" />
                  <rect x="4" y="26" width="20" height="4" rx="1" fill="#64748B" />
                  <rect x="28" y="26" width="12" height="4" rx="1" fill="#64748B" />
                  <circle cx="52" cy="28" r="6" fill="#F59E0B" />
                  <circle cx="52" cy="28" r="4" fill="#FBBF24" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
                  Your credit card payment has been initiated
                </span>
                {activePayment.invoiceUrl && (
                  <a
                    href={activePayment.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="icon-button"
                    style={{ display: 'flex', gap: '8px', textDecoration: 'none' }}
                  >
                    Open Invoice
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
                <span style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                  Your card will be charged {formatCurrency(activePayment.value)}
                </span>
                {activePayment.stripeClientSecret && (
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => onConfirmStripePayment(activePayment)}
                  >
                    Confirm card authentication
                  </button>
                )}
              </div>
            )}

            {activePayment.billingType === 'boleto' && activePayment.bankSlipUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '24px 0' }}>
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
                  Your boleto has been generated successfully
                </span>
                <a
                  href={activePayment.bankSlipUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-button"
                  style={{ display: 'flex', gap: '8px', textDecoration: 'none' }}
                >
                  Open Boleto PDF
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button
              className="filter-chip"
              type="button"
              onClick={onRequestClose}
            >
              Close
            </button>
          </div>
        </section>
      </div>

      {isPaymentCloseConfirmOpen && (
        <div className="modal-backdrop" onClick={onKeepOpen}>
          <section className="modal-panel integration-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Close payment</h2>
                <p>Are you sure you want to close this payment? You can reopen it from the pending invoice banner.</p>
              </div>
              <button className="modal-close" type="button" onClick={onKeepOpen}>
                x
              </button>
            </div>
            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={onKeepOpen}>
                Keep open
              </button>
              <button
                className="icon-button danger-button"
                type="button"
                onClick={onCloseConfirm}
              >
                Yes, close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
