import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPlans,
  fetchSubscriptionStatus,
  updateSubscription,
  cancelPendingPayment,
  cancelScheduledChange,
  subscribeToSubscriptionStatus,
  type PlanDTO,
  type PendingPaymentDTO,
  type ScheduledChangeDTO
} from '../../shared/api/billing';
import { PageHead, Panel, InlineMessage } from '../../shared/ui/primitives';

export function SubscriptionPage() {
  const queryClient = useQueryClient();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PlanDTO | null>(null);
  
  // Modals state
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [choiceCycle, setChoiceCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [choiceType, setChoiceType] = useState<'credit_card' | 'pix' | 'boleto'>('credit_card');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<PendingPaymentDTO | null>(null);

  const [copied, setCopied] = useState(false);

  // SSE Subscription for real-time status updates
  useEffect(() => {
    const unsubscribe = subscribeToSubscriptionStatus((data) => {
      if (data) {
        queryClient.setQueryData(['billing', 'status'], data);
        const pendingPayment = data.summary.latestPendingPayment;
        if (pendingPayment) {
          setActivePayment(pendingPayment);
        } else {
          setIsPaymentModalOpen(false);
          setActivePayment(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  // Queries
  const plansQuery = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: fetchPlans,
  });

  const statusQuery = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchSubscriptionStatus,
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: updateSubscription,
    onSuccess: (data) => {
      queryClient.setQueryData(['billing', 'status'], data);
      setIsChoiceModalOpen(false);
      
      const pendingPayment = data.summary.latestPendingPayment;
      if (pendingPayment && (pendingPayment.billingType === 'pix' || pendingPayment.billingType === 'boleto')) {
        setActivePayment(pendingPayment);
        setIsPaymentModalOpen(true);
      }
    },
  });

  const cancelPaymentMutation = useMutation({
    mutationFn: cancelPendingPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
    },
  });

  const cancelChangeMutation = useMutation({
    mutationFn: cancelScheduledChange,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
    },
  });

  const plans = plansQuery.data || [];
  const status = statusQuery.data;
  const summary = status?.summary;

  const currentPlan = useMemo(() => {
    if (!status || !plans.length) return null;
    return plans.find(p => p.id === summary?.latestSub?.planId) || null;
  }, [status, plans, summary]);

  const handleOpenChoice = (plan: PlanDTO) => {
    setSelectedPlan(plan);
    setChoiceCycle(billingCycle);
    setChoiceType('credit_card');
    setIsChoiceModalOpen(true);
  };

  const handleConfirmChoice = () => {
    if (!selectedPlan) return;
    updateMutation.mutate({
      planId: selectedPlan.id,
      billingCycle: choiceCycle,
      billingType: choiceType,
    });
  };

  const handleCopyPix = () => {
    if (!activePayment?.pixQrCode) return;
    void navigator.clipboard.writeText(activePayment.pixQrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isLoading = plansQuery.isLoading || statusQuery.isLoading;

  return (
    <>
      <PageHead title="Subscription Management" subtitle="Choose plans, manage invoice cycles, and payment methods" />
      <Panel className="subscription-panel">
        {isLoading && <div className="profile-state" role="status">Loading subscription details...</div>}
        
        {plansQuery.isError && <InlineMessage tone="error">Failed to load available plans.</InlineMessage>}
        {statusQuery.isError && <InlineMessage tone="error">Failed to retrieve subscription status.</InlineMessage>}

        {status && summary && (
          <>
            {/* Scheduled change request banner */}
            {summary.scheduledChange && (
              <div className="status-banner info">
                <div className="status-banner-content">
                  <span className="status-banner-title">
                    Change scheduled
                  </span>
                  <span className="status-banner-desc">
                    Your plan is scheduled to change to <strong>{plans.find(p => p.id === summary.scheduledChange?.toPlanId)?.name || 'Free'}</strong> on {formatDate(summary.scheduledChange.effectiveAt)}.
                  </span>
                </div>
                <button
                  type="button"
                  className="filter-chip"
                  style={{ border: '1px solid var(--primary)', color: 'var(--primary)' }}
                  onClick={() => cancelChangeMutation.mutate(summary.scheduledChange!.id)}
                  disabled={cancelChangeMutation.isPending}
                >
                  {cancelChangeMutation.isPending ? 'Canceling...' : 'Cancel change'}
                </button>
              </div>
            )}

            {/* Pending payment banner */}
            {summary.latestPendingPayment && (
              <div className="status-banner warning">
                <div className="status-banner-content">
                  <span className="status-banner-title">
                    Pending invoice
                  </span>
                  <span className="status-banner-desc">
                    You have a pending invoice of {formatCurrency(summary.latestPendingPayment.value)} due on {formatDate(summary.latestPendingPayment.dueDate)}.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={() => {
                      setActivePayment(summary.latestPendingPayment);
                      setIsPaymentModalOpen(true);
                    }}
                  >
                    View payment details
                  </button>
                  <button
                    type="button"
                    className="filter-chip"
                    style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.4)', color: 'rgb(220,38,38)' }}
                    onClick={() => cancelPaymentMutation.mutate(summary.latestPendingPayment!.id)}
                    disabled={cancelPaymentMutation.isPending}
                  >
                    {cancelPaymentMutation.isPending ? 'Canceling...' : 'Cancel invoice'}
                  </button>
                </div>
              </div>
            )}

            {/* Plan Display Header & Toggle */}
            <div className="subscription-header-row">
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Available Plans</h2>
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
              {plans.map(plan => {
                const isCurrent = summary.latestSub?.planId === plan.id;
                const isFree = plan.isDefault;
                
                // Calculate display price based on global state cycle selection
                const displayPrice = billingCycle === 'yearly' ? plan.annualPrice : plan.price;

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
                        {plan.maxAiRequestsPerMonth === -1 ? 'Unlimited' : plan.maxAiRequestsPerMonth} AI Queries / month
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
                        {isFree ? 'Downgrade' : 'Upgrade Plan'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {/* 1. Modal: Billing Cycle & Payment Selection */}
      {isChoiceModalOpen && selectedPlan && (
        <div className="modal-backdrop" onClick={() => setIsChoiceModalOpen(false)}>
          <section className="modal-panel integration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Choose billing options</h2>
                <p>Select cycle and payment details for <strong>{selectedPlan.name}</strong></p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsChoiceModalOpen(false)}>x</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0' }}>
              <div className="inline-message warning" style={{ fontSize: '12px' }}>
                Upgrades are applied immediately with proportional charging. Downgrades and billing cycle modifications will be scheduled for the next period.
              </div>

              {/* Cycle chooser inside modal (Free is always monthly) */}
              {!selectedPlan.isDefault && (
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Billing Cycle</label>
                  <div className="cycle-selector" style={{ width: 'max-content' }}>
                    <button
                      type="button"
                      className={`cycle-btn ${choiceCycle === 'monthly' ? 'active' : ''}`}
                      onClick={() => {
                        setChoiceCycle('monthly');
                        if (choiceType === 'boleto') setChoiceType('credit_card');
                      }}
                    >
                      Monthly ({formatCurrency(selectedPlan.price)})
                    </button>
                    <button
                      type="button"
                      className={`cycle-btn ${choiceCycle === 'yearly' ? 'active' : ''}`}
                      onClick={() => setChoiceCycle('yearly')}
                    >
                      Yearly ({formatCurrency(selectedPlan.annualPrice)})
                      <span className="discount-badge">Save 20%</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Payment Type Selection */}
              {!selectedPlan.isDefault && (
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Payment Method</label>
                  <div className="billing-options-grid">
                    <div
                      className={`billing-option-card ${choiceType === 'credit_card' ? 'selected' : ''}`}
                      onClick={() => setChoiceType('credit_card')}
                    >
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                      </svg>
                      <span className="billing-option-label">Credit Card</span>
                    </div>

                    <div
                      className={`billing-option-card ${choiceType === 'pix' ? 'selected' : ''}`}
                      onClick={() => setChoiceType('pix')}
                    >
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.875 15.75a1.125 1.125 0 01-1.125-1.125v-1.5a1.125 1.125 0 011.125-1.125h1.5a1.125 1.125 0 011.125 1.125v1.5a1.125 1.125 0 01-1.125 1.125h-1.5z" />
                      </svg>
                      <span className="billing-option-label">PIX</span>
                    </div>

                    <div
                      className={`billing-option-card ${choiceType === 'boleto' ? 'selected' : ''}`}
                      onClick={() => setChoiceType('boleto')}
                    >
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="billing-option-label">Boleto</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={() => setIsChoiceModalOpen(false)}>
                Cancel
              </button>
              <button
                className="icon-button"
                disabled={updateMutation.isPending}
                type="button"
                onClick={handleConfirmChoice}
              >
                {updateMutation.isPending ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 2. Modal: Subscription Payment Details */}
      {isPaymentModalOpen && activePayment && (
        <div className="modal-backdrop" onClick={() => setIsPaymentModalOpen(false)}>
          <section className="modal-panel integration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Payment instructions</h2>
                <p>Complete the payment of {formatCurrency(activePayment.value)} to activate your subscription</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsPaymentModalOpen(false)}>x</button>
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
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="profile-connection-btn"
                      onClick={handleCopyPix}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
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
                onClick={() => setIsPaymentModalOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
