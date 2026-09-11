import { type RefObject } from 'react';
import { type PlanDTO } from '../../../shared/api/billing';
import { StripeCardCapture, type StripeCardCaptureHandle } from '../StripeCardCapture';
import { InlineMessage } from '../../../shared/ui/primitives';
import { BILLING_CYCLE, BILLING_TYPE, type BillingCycle, type BillingType } from '../../../shared/constants/billing.constants';

interface BillingChoiceModalProps {
  isOpen: boolean;
  selectedPlan: PlanDTO | null;
  choiceCycle: BillingCycle;
  choiceType: BillingType;
  hasCreditCardOnFile: boolean;
  isBrazil: boolean;
  isInternational: boolean;
  onlyStripe: boolean;
  modalEffectiveBillingType: string;
  modalCanChooseManualMethods: boolean;
  cpfCnpj: string;
  cpfCnpjError: string;
  requiresStripeCardCapture: boolean;
  stripePublishableKey: string | undefined;
  stripeCardRef: RefObject<StripeCardCaptureHandle | null>;
  stripeCardError: string;
  isPending: boolean;
  isChoiceCloseConfirmOpen: boolean;
  onSetChoiceCycle: (cycle: BillingCycle) => void;
  onSetChoiceType: (type: BillingType) => void;
  onCpfCnpjChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmChoice: () => void;
  onRequestClose: () => void;
  onCloseConfirm: () => void;
  onKeepEditing: () => void;
  formatCurrency: (val: number) => string;
}

export function BillingChoiceModal({
  isOpen,
  selectedPlan,
  choiceCycle,
  choiceType,
  hasCreditCardOnFile,
  isBrazil,
  isInternational,
  onlyStripe,
  modalEffectiveBillingType,
  modalCanChooseManualMethods,
  cpfCnpj,
  cpfCnpjError,
  requiresStripeCardCapture,
  stripePublishableKey,
  stripeCardRef,
  stripeCardError,
  isPending,
  isChoiceCloseConfirmOpen,
  onSetChoiceCycle,
  onSetChoiceType,
  onCpfCnpjChange,
  onConfirmChoice,
  onRequestClose,
  onCloseConfirm,
  onKeepEditing,
  formatCurrency,
}: BillingChoiceModalProps) {
  if (!isOpen || !selectedPlan) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onRequestClose}>
        <section className="modal-panel integration-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>Choose billing options</h2>
              <p>
                Select cycle and payment details for <strong>{selectedPlan.name}</strong>
              </p>
            </div>
            <button className="modal-close" type="button" onClick={onRequestClose}>
              x
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0' }}>
            <div className="inline-message warning" style={{ fontSize: '12px' }}>
              New subscriptions and upgrades are activated after payment confirmation. Downgrades and billing cycle changes are scheduled for the next period.
            </div>

            {hasCreditCardOnFile && choiceCycle === BILLING_CYCLE.MONTHLY && (
              <div className="inline-message" style={{ fontSize: '12px' }}>
                With a saved card, monthly subscriptions use credit card automatically.
              </div>
            )}

            {/* Cycle chooser inside modal (Free is always monthly) */}
            {!selectedPlan.isDefault && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                  Billing Cycle
                </label>
                <div className="cycle-selector" style={{ width: 'max-content' }}>
                  <button
                    type="button"
                    className={`cycle-btn ${choiceCycle === BILLING_CYCLE.MONTHLY ? 'active' : ''}`}
                    onClick={() => {
                      onSetChoiceCycle(BILLING_CYCLE.MONTHLY);
                      if (hasCreditCardOnFile) {
                        onSetChoiceType(BILLING_TYPE.CREDIT_CARD);
                      } else if (choiceType === BILLING_TYPE.BOLETO) {
                        onSetChoiceType(BILLING_TYPE.CREDIT_CARD);
                      }
                    }}
                  >
                    Monthly ({formatCurrency(!isInternational ? selectedPlan.price : selectedPlan.priceUsd)})
                  </button>
                  <button
                    type="button"
                    className={`cycle-btn ${choiceCycle === BILLING_CYCLE.YEARLY ? 'active' : ''}`}
                    onClick={() => onSetChoiceCycle(BILLING_CYCLE.YEARLY)}
                  >
                    Yearly ({formatCurrency(!isInternational ? selectedPlan.annualPrice : selectedPlan.annualPriceUsd)})
                    <span className="discount-badge">Save 20%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Type Selection */}
            {!selectedPlan.isDefault && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                  Payment Method
                </label>
                <div className="billing-options-grid">
                  <div
                    className={`billing-option-card ${choiceType === BILLING_TYPE.CREDIT_CARD ? 'selected' : ''}`}
                    onClick={() => onSetChoiceType(BILLING_TYPE.CREDIT_CARD)}
                  >
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    <span className="billing-option-label">Credit Card</span>
                  </div>

                  {isBrazil && !onlyStripe && modalCanChooseManualMethods && (
                    <>
                      <div
                        className={`billing-option-card ${choiceType === BILLING_TYPE.PIX ? 'selected' : ''}`}
                        onClick={() => onSetChoiceType(BILLING_TYPE.PIX)}
                      >
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.875 15.75a1.125 1.125 0 01-1.125-1.125v-1.5a1.125 1.125 0 011.125-1.125h1.5a1.125 1.125 0 011.125 1.125v1.5a1.125 1.125 0 01-1.125 1.125h-1.5z" />
                        </svg>
                        <span className="billing-option-label">PIX</span>
                      </div>

                      <div
                        className={`billing-option-card ${choiceType === BILLING_TYPE.BOLETO ? 'selected' : ''}`}
                        onClick={() => onSetChoiceType(BILLING_TYPE.BOLETO)}
                      >
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="billing-option-label">Boleto</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CPF/CNPJ Field - Required for PIX and Boleto */}
            {!selectedPlan.isDefault && !isInternational && (modalEffectiveBillingType === BILLING_TYPE.PIX || modalEffectiveBillingType === BILLING_TYPE.BOLETO) && (
              <div className="form-field">
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                  CPF/CNPJ <span style={{ color: 'rgb(220, 38, 38)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={cpfCnpj}
                  onChange={onCpfCnpjChange}
                  placeholder="000.000.000-00 or 00.000.000/0000-00"
                  aria-invalid={!!cpfCnpjError}
                  style={{ fontFamily: 'monospace' }}
                />
                {cpfCnpjError && <span className="form-error">{cpfCnpjError}</span>}
                <span className="form-field-meta">Required for invoice issuance</span>
              </div>
            )}

            {requiresStripeCardCapture && stripePublishableKey && (
              <StripeCardCapture
                ref={stripeCardRef}
                publishableKey={stripePublishableKey}
                disabled={isPending}
              />
            )}

            {requiresStripeCardCapture && !stripePublishableKey && (
              <InlineMessage tone="error">
                Stripe is not configured for international card payments.
              </InlineMessage>
            )}

            {stripeCardError && <InlineMessage tone="error">{stripeCardError}</InlineMessage>}
          </div>

          <div className="form-actions">
            <button className="filter-chip" type="button" onClick={onRequestClose}>
              Cancel
            </button>
            <button
              className="icon-button"
              disabled={isPending}
              type="button"
              onClick={onConfirmChoice}
            >
              {isPending ? 'Confirming...' : 'Confirm'}
            </button>
          </div>
        </section>
      </div>

      {isChoiceCloseConfirmOpen && (
        <div className="modal-backdrop" onClick={onKeepEditing}>
          <section className="modal-panel integration-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Close billing options</h2>
                <p>Are you sure you want to close this modal? Your selections will be discarded.</p>
              </div>
              <button className="modal-close" type="button" onClick={onKeepEditing}>
                x
              </button>
            </div>
            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={onKeepEditing}>
                Keep editing
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
