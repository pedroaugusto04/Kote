import { PageHead, Panel, InlineMessage } from '../../shared/ui/primitives';
import { useSubscriptionBilling } from '../../features/billing/hooks/useSubscriptionBilling';
import { BillingChoiceModal } from '../../features/billing/components/BillingChoiceModal';
import { PaymentInstructionsModal } from '../../features/billing/components/PaymentInstructionsModal';
import { CancelScheduledChangeModal } from '../../features/billing/components/CancelScheduledChangeModal';

export function SubscriptionPage() {
  const {
    isBrazil,
    isInternational,
    onlyStripe,
    stripePublishableKey,
    billingCycle,
    setBillingCycle,
    selectedPlan,
    isChoiceModalOpen,
    setIsChoiceModalOpen,
    choiceCycle,
    setChoiceCycle,
    choiceType,
    setChoiceType,
    cpfCnpj,
    cpfCnpjError,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    activePayment,
    setActivePayment,
    isCancelScheduledModalOpen,
    setIsCancelScheduledModalOpen,
    isPaymentCloseConfirmOpen,
    setIsPaymentCloseConfirmOpen,
    isChoiceCloseConfirmOpen,
    setIsChoiceCloseConfirmOpen,
    copied,
    stripeCardRef,
    stripeCardError,
    statusQuery,
    plansQuery,
    status,
    summary,
    plans,
    entitledPlanId,
    hasCreditCardOnFile,
    hasOpenSubscription,
    latestPendingPayment,
    isLatestPaymentCard,
    isLatestPaymentManual,
    isFutureRenewalCharge,
    showPendingChargeCard,
    updateMutation,
    cancelPaymentMutation,
    cancelChangeMutation,
    modalEffectiveBillingType,
    modalCanChooseManualMethods,
    requiresStripeCardCapture,
    isLoading,
    handleOpenChoice,
    handleConfirmChoice,
    handleCopyPix,
    handleRefreshSubscription,
    requestClosePaymentModal,
    requestCloseChoiceModal,
    handleCpfCnpjChange,
    confirmStripePaymentIfNeeded,
    formatCurrency,
    formatDate,
  } = useSubscriptionBilling();

  return (
    <>
      <PageHead title="Subscription Management" subtitle="Choose plans, manage invoice cycles, and payment methods" />
      <Panel className="subscription-panel">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: summary ? '12px' : 0 }}>
          <button
            type="button"
            className="filter-chip"
            onClick={handleRefreshSubscription}
            disabled={statusQuery.isFetching || plansQuery.isFetching}
          >
            {statusQuery.isFetching || plansQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {isLoading && <div className="profile-state" role="status">Loading subscription details...</div>}

        {plansQuery.isError && <InlineMessage tone="error">Failed to load available plans.</InlineMessage>}
        {statusQuery.isError && <InlineMessage tone="error">Failed to retrieve subscription status.</InlineMessage>}

        {status && summary && (
          <>
            {/* Scheduled change request banner */}
            {summary.scheduledChange && (
              <div className="status-banner warning" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="status-banner-content" style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span className="current-badge" style={{ position: 'static', background: 'var(--surface-warning)', color: 'var(--warning-text)', fontSize: '11px', padding: '2px 8px', border: '1px solid var(--warning-border)' }}>
                        {summary.scheduledChange.type === 'downgrade' ? 'Scheduled Downgrade' : 'Scheduled Cycle Change'}
                      </span>
                      <span className="current-badge" style={{ position: 'static', background: 'var(--surface-3)', color: 'var(--text-strong)', fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border-subtle)' }}>
                        Effective on {formatDate(summary.scheduledChange.effectiveAt)}
                      </span>
                    </div>
                    <span className="status-banner-desc" style={{ fontWeight: 500, fontSize: '14px' }}>
                      {summary.scheduledChange.type === 'change_cycle'
                        ? `Your billing cycle will be changed to ${summary.scheduledChange.toBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'} starting on ${formatDate(summary.scheduledChange.effectiveAt)}.`
                        : `You will continue to have access to your current plan until ${formatDate(summary.scheduledChange.effectiveAt)}. After that, your plan will be changed to ${summary.scheduledChange.toPlan?.name || 'Free'} (${summary.scheduledChange.toBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'}).`
                      }
                    </span>

                    <div className="scheduled-change-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '16px' }}>
                      <div style={{ background: 'var(--surface-1)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>NEW PLAN</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '4px' }}>
                          {summary.scheduledChange.toPlan?.name || 'Free'}
                        </div>
                      </div>
                      <div style={{ background: 'var(--surface-1)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>NEW CYCLE</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '4px' }}>
                          {summary.scheduledChange.toBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
                        </div>
                      </div>
                      <div style={{ background: 'var(--surface-1)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>PRICE</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '4px' }}>
                          {(() => {
                            const p = summary.scheduledChange.toPlan;
                            if (!p) return 'Free';
                            const priceVal = !isInternational
                              ? (summary.scheduledChange.toBillingCycle === 'yearly' ? p.annualPrice : p.price)
                              : (summary.scheduledChange.toBillingCycle === 'yearly' ? p.annualPriceUsd : p.priceUsd);
                            return priceVal === 0 ? 'Free' : `${formatCurrency(priceVal)}/${summary.scheduledChange.toBillingCycle === 'yearly' ? 'year' : 'month'}`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="filter-chip"
                    style={{ border: '1px solid var(--danger-border)', color: 'var(--danger-text)', background: 'var(--surface-danger)', fontWeight: 600, padding: '8px 16px', borderRadius: '6px' }}
                    onClick={() => setIsCancelScheduledModalOpen(true)}
                  >
                    Cancel Change
                  </button>
                </div>
              </div>
            )}

            {showPendingChargeCard && latestPendingPayment && (
              <div className="status-banner warning">
                <div className="status-banner-content">
                  <span className="status-banner-title">
                    Pending invoice
                  </span>
                  <span className="status-banner-desc">
                    You have a pending invoice of {formatCurrency(latestPendingPayment.value)} due on {formatDate(latestPendingPayment.dueDate)}.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => {
                      setActivePayment(latestPendingPayment);
                      setIsPaymentModalOpen(true);
                    }}
                  >
                    View payment details
                  </button>
                  {latestPendingPayment.canCancel && (
                    <button
                      type="button"
                      className="filter-chip"
                      style={{ background: 'transparent', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}
                      onClick={() => cancelPaymentMutation.mutate(latestPendingPayment.id)}
                      disabled={cancelPaymentMutation.isPending}
                    >
                      {cancelPaymentMutation.isPending ? 'Canceling...' : 'Cancel invoice'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isFutureRenewalCharge && latestPendingPayment && (
              <div className="status-banner warning">
                <div className="status-banner-content">
                  <span className="status-banner-title">
                    Upcoming renewal
                  </span>
                  <span className="status-banner-desc">
                    {formatCurrency(latestPendingPayment.value)} due on {formatDate(latestPendingPayment.dueDate)}
                    {isLatestPaymentCard ? '. Automatic renewal on card.' : '.'}
                  </span>
                </div>
                {isLatestPaymentManual && (
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => {
                      setActivePayment(latestPendingPayment);
                      setIsPaymentModalOpen(true);
                    }}
                  >
                    View payment details
                  </button>
                )}
              </div>
            )}

            {/* Plan Display Header & Toggle */}
            <div className="subscription-header-row">
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Available Plans</h2>
                {summary.entitledUntil && (
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    Active until {formatDate(summary.entitledUntil)}
                  </p>
                )}
              </div>
              <div className="cycle-selector">
                <button
                  type="button"
                  className={`cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={`cycle-btn ${billingCycle === 'yearly' ? 'active' : ''}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Yearly
                  <span className="discount-badge">Save 20%</span>
                </button>
              </div>
            </div>

            {/* Plans Card Grid */}
            <div className="subscription-grid">
              {plans.map((plan) => {
                const isCurrent = plan.id === entitledPlanId;
                const isFree = plan.isDefault;

                const displayPrice = !isInternational
                  ? (billingCycle === 'yearly' ? plan.annualPrice : plan.price)
                  : (billingCycle === 'yearly' ? plan.annualPriceUsd : plan.priceUsd);

                return (
                  <div
                    key={plan.id}
                    className={`plan-card ${isCurrent ? 'current' : ''}`}
                    style={{ cursor: !isCurrent ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (!isCurrent) {
                        handleOpenChoice(plan);
                      }
                    }}
                  >
                    {isCurrent && <span className="current-badge">Current Plan</span>}

                    <h3 className="plan-name">{plan.name}</h3>
                    <p className="plan-desc">{plan.description}</p>

                    <div className="plan-price-wrapper">
                      <span className="plan-price">{formatCurrency(displayPrice)}</span>
                      <span className="plan-price-period">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                    </div>

                    <ul className="plan-features-list">
                      <li className="plan-feature-item">
                        <svg className="plan-feature-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {plan.maxWorkspaces === -1 ? 'Unlimited' : plan.maxWorkspaces} Workspaces
                      </li>
                      <li className="plan-feature-item">
                        <svg className="plan-feature-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {plan.maxProjectsPerWorkspace === -1 ? 'Unlimited' : plan.maxProjectsPerWorkspace} Projects per workspace
                      </li>
                      <li className="plan-feature-item">
                        <svg className="plan-feature-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {plan.maxAiCreditsPerMonth === -1 ? 'Unlimited' : plan.maxAiCreditsPerMonth} AI Credits / month
                      </li>
                      <li className="plan-feature-item">
                        <svg className="plan-feature-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {plan.maxStorageBytes === -1 ? 'Unlimited' : `${(plan.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`} storage
                      </li>
                    </ul>

                    {isCurrent ? (
                      <button type="button" className="plan-button secondary" disabled style={{ pointerEvents: 'none' }}>
                        Active
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`plan-button ${isFree ? 'secondary' : 'primary'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenChoice(plan);
                        }}
                      >
                        {isFree
                          ? 'Downgrade'
                          : hasOpenSubscription
                            ? 'Switch Plan'
                            : 'Upgrade Plan'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {hasCreditCardOnFile && (
              <div className="inline-message" style={{ marginTop: '16px', fontSize: '12px' }}>
                Card on file: monthly plans renew automatically on your saved card.
              </div>
            )}
          </>
        )}
      </Panel>

      <BillingChoiceModal
        isOpen={isChoiceModalOpen}
        selectedPlan={selectedPlan}
        choiceCycle={choiceCycle}
        choiceType={choiceType}
        hasCreditCardOnFile={hasCreditCardOnFile}
        isBrazil={isBrazil}
        isInternational={isInternational}
        onlyStripe={onlyStripe}
        modalEffectiveBillingType={modalEffectiveBillingType}
        modalCanChooseManualMethods={modalCanChooseManualMethods}
        cpfCnpj={cpfCnpj}
        cpfCnpjError={cpfCnpjError}
        requiresStripeCardCapture={requiresStripeCardCapture}
        stripePublishableKey={stripePublishableKey ?? undefined}
        stripeCardRef={stripeCardRef}
        stripeCardError={stripeCardError}
        isPending={updateMutation.isPending}
        isChoiceCloseConfirmOpen={isChoiceCloseConfirmOpen}
        onSetChoiceCycle={setChoiceCycle}
        onSetChoiceType={setChoiceType}
        onCpfCnpjChange={handleCpfCnpjChange}
        onConfirmChoice={handleConfirmChoice}
        onRequestClose={requestCloseChoiceModal}
        onCloseConfirm={() => {
          setIsChoiceCloseConfirmOpen(false);
          setIsChoiceModalOpen(false);
        }}
        onKeepEditing={() => setIsChoiceCloseConfirmOpen(false)}
        formatCurrency={formatCurrency}
      />

      <PaymentInstructionsModal
        isOpen={isPaymentModalOpen}
        activePayment={activePayment}
        isPaymentCloseConfirmOpen={isPaymentCloseConfirmOpen}
        copied={copied}
        onRequestClose={requestClosePaymentModal}
        onCloseConfirm={() => {
          setIsPaymentCloseConfirmOpen(false);
          setIsPaymentModalOpen(false);
          setActivePayment(null);
        }}
        onKeepOpen={() => setIsPaymentCloseConfirmOpen(false)}
        onCopyPix={handleCopyPix}
        onConfirmStripePayment={confirmStripePaymentIfNeeded}
        formatCurrency={formatCurrency}
      />

      <CancelScheduledChangeModal
        isOpen={isCancelScheduledModalOpen}
        scheduledChange={summary?.scheduledChange}
        isPending={cancelChangeMutation.isPending}
        onRequestClose={() => setIsCancelScheduledModalOpen(false)}
        onConfirmCancel={() => {
          if (summary?.scheduledChange) {
            cancelChangeMutation.mutate(summary.scheduledChange.id, {
              onSuccess: () => {
                setIsCancelScheduledModalOpen(false);
              },
            });
          }
        }}
      />
    </>
  );
}
