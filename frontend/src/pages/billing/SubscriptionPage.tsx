import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import {
  fetchPlans,
  fetchStripeConfig,
  fetchSubscriptionStatus,
  fetchDetectedCountry,
  updateSubscription,
  cancelPendingPayment,
  cancelScheduledChange,
  subscribeToSubscriptionStatus,
  type PlanDTO,
  type PendingPaymentDTO,
  type ScheduledChangeDTO
} from '../../shared/api/billing';
import { StripeCardCapture, type StripeCardCaptureHandle } from '../../features/billing/StripeCardCapture';
import { PageHead, Panel, InlineMessage } from '../../shared/ui/primitives';
import { formatCpfCnpj, isValidCpfCnpjFormat } from '../../shared/utils/cpf-cnpj';
import { detectUserCountry } from '../../shared/utils/location';
import { BILLING_ERROR_MESSAGES, BILLING_CYCLE, BILLING_TYPE, SUBSCRIPTION_CHANGE_KIND, SUBSCRIPTION_STATUS, type BillingCycle, type BillingType } from '../../shared/constants/billing.constants';
import {
  canChooseManualMonthlyPayment,
  isManualBillingType,
  isOpenSubscriptionStatus,
  mergePendingPayment,
  pendingChargeStatus,
  resolveEffectiveMonthlyBillingType,
  toUtcDateOnlyTimestamp,
} from '../../shared/utils/billing/subscription-ui';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';

export function SubscriptionPage() {
  const queryClient = useQueryClient();

  const { data: countryData } = useQuery({
    queryKey: ['billing', 'detectedCountry'],
    queryFn: fetchDetectedCountry,
    staleTime: Infinity,
  });

  const { data: stripeConfig } = useQuery({
    queryKey: ['billing', 'stripeConfig'],
    queryFn: fetchStripeConfig,
    staleTime: Infinity,
  });

  const isBrazil = useMemo(() => {
    if (countryData?.country) {
      return countryData.country === 'BR';
    }
    return detectUserCountry() === 'BR';
  }, [countryData]);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>(BILLING_CYCLE.MONTHLY);
  const [selectedPlan, setSelectedPlan] = useState<PlanDTO | null>(null);

  // Modals state
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [choiceCycle, setChoiceCycle] = useState<BillingCycle>(BILLING_CYCLE.MONTHLY);
  const [choiceType, setChoiceType] = useState<BillingType>(BILLING_TYPE.CREDIT_CARD);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [cpfCnpjError, setCpfCnpjError] = useState('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<PendingPaymentDTO | null>(null);

  const [isCancelScheduledModalOpen, setIsCancelScheduledModalOpen] = useState(false);
  const [isPaymentCloseConfirmOpen, setIsPaymentCloseConfirmOpen] = useState(false);
  const [isChoiceCloseConfirmOpen, setIsChoiceCloseConfirmOpen] = useState(false);

  const [copied, setCopied] = useState(false);
  const hadPendingPaymentRef = useRef(false);
  const stripeCardRef = useRef<StripeCardCaptureHandle | null>(null);
  const [stripeCardError, setStripeCardError] = useState('');

  const statusQuery = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchSubscriptionStatus,
  });

  const summary = statusQuery.data?.summary;
  const hasCreditCardOnFile = Boolean(summary?.hasCreditCardOnFile);
  const latestPendingPayment = summary?.latestPendingPayment ?? null;
  const latestSubStatus = summary?.latestSub?.status;

  const shouldSubscribeSse = useMemo(() => {
    if (!summary) return false;
    return (
      Boolean(latestPendingPayment) ||
      latestSubStatus === SUBSCRIPTION_STATUS.PENDING ||
      latestSubStatus === SUBSCRIPTION_STATUS.PAST_DUE
    );
  }, [summary, latestPendingPayment?.id, latestSubStatus]);

  // SSE subscription while there is an open charge or pending/past-due subscription
  useEffect(() => {
    if (!shouldSubscribeSse) return;

    const unsubscribe = subscribeToSubscriptionStatus((data) => {
      if (!data) return;

      const previousEntitledPlanId = statusQuery.data?.summary?.entitledPlanId;
      const hadPendingPayment = hadPendingPaymentRef.current;

      queryClient.setQueryData(['billing', 'status'], data);

      const pendingPayment = data.summary.latestPendingPayment;
      if (pendingPayment) {
        hadPendingPaymentRef.current = true;
        setActivePayment((current) => mergePendingPayment(current, pendingPayment));
        return;
      }

      if (
        hadPendingPayment &&
        previousEntitledPlanId &&
        data.summary.entitledPlanId !== previousEntitledPlanId
      ) {
        setIsPaymentModalOpen(false);
        setActivePayment(null);
        notifySuccess('Subscription activated successfully');
        hadPendingPaymentRef.current = false;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [shouldSubscribeSse, queryClient, statusQuery.data?.summary?.entitledPlanId]);

  useEffect(() => {
    if (!isPaymentModalOpen || !latestPendingPayment) return;
    setActivePayment((current) => mergePendingPayment(current, latestPendingPayment));
  }, [isPaymentModalOpen, latestPendingPayment]);

  // Queries
  const plansQuery = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: fetchPlans,
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: updateSubscription,
    onSuccess: (data) => {
      queryClient.setQueryData(['billing', 'status'], data);
      setIsChoiceModalOpen(false);

      if (
        data.changeKind === SUBSCRIPTION_CHANGE_KIND.DOWNGRADE ||
        data.changeKind === SUBSCRIPTION_CHANGE_KIND.CHANGE_CYCLE
      ) {
        notifySuccess('Subscription change scheduled successfully');
        return;
      }

      const pendingPayment = data.summary.latestPendingPayment;
      if (pendingPayment) {
        hadPendingPaymentRef.current = true;
        setActivePayment((current) => mergePendingPayment(current, pendingPayment));
        setIsPaymentModalOpen(true);
        void confirmStripePaymentIfNeeded(pendingPayment);
        return;
      }

      notifySuccess('Subscription updated successfully');
    },
    onError: (error) => {
      notifyError(error instanceof Error ? error.message : 'An error occurred');
    },
  });

  const cancelPaymentMutation = useMutation({
    mutationFn: cancelPendingPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
      notifySuccess('Payment canceled successfully');
    },
    onError: (error) => {
      notifyError(error instanceof Error ? error.message : 'Failed to cancel payment');
    },
  });

  const cancelChangeMutation = useMutation({
    mutationFn: cancelScheduledChange,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
      notifySuccess('Scheduled change canceled successfully');
    },
    onError: (error) => {
      notifyError(error instanceof Error ? error.message : 'Failed to cancel scheduled change');
    },
  });

  const plans = plansQuery.data || [];
  const status = statusQuery.data;
  const savedCpfCnpj = status?.cpfCnpj || '';

  const defaultPlanId = useMemo(
    () => plans.find((plan) => plan.isDefault)?.id ?? null,
    [plans],
  );

  const entitledPlanId = summary?.entitledPlanId ?? defaultPlanId;
  const allowManualMonthlyPayment = canChooseManualMonthlyPayment(hasCreditCardOnFile);
  const modalCanChooseManualMethods = choiceCycle !== BILLING_CYCLE.MONTHLY || allowManualMonthlyPayment;
  const modalEffectiveBillingType = resolveEffectiveMonthlyBillingType(
    choiceCycle,
    hasCreditCardOnFile,
    choiceType,
  );
  const stripePublishableKey = stripeConfig?.publishableKey || null;
  const onlyStripe = stripeConfig?.onlyStripe || false;
  const isInternational = onlyStripe || !isBrazil;
  const requiresStripeCardCapture = Boolean(
    isInternational &&
    modalEffectiveBillingType === BILLING_TYPE.CREDIT_CARD &&
    !hasCreditCardOnFile &&
    !selectedPlan?.isDefault,
  );
  const hasOpenSubscription = Boolean(
    summary?.latestSub && isOpenSubscriptionStatus(summary.latestSub.status),
  );

  const latestPaymentDueDateUtcMs = useMemo(() => {
    const raw = latestPendingPayment?.dueDate;
    if (!raw) return null;
    return toUtcDateOnlyTimestamp(raw);
  }, [latestPendingPayment?.dueDate]);

  const todayUtcMs = useMemo(() => toUtcDateOnlyTimestamp(new Date()) ?? 0, []);

  const isLatestPaymentPendingOrOverdue = Boolean(
    latestPendingPayment && pendingChargeStatus(latestPendingPayment.status),
  );
  const isLatestPaymentFuture = Boolean(
    latestPaymentDueDateUtcMs !== null && latestPaymentDueDateUtcMs > todayUtcMs,
  );
  const isPendingUpgradeCharge = Boolean(latestPendingPayment?.canCancel);
  const isLatestPaymentManual = isManualBillingType(latestPendingPayment?.billingType);
  const isLatestPaymentCard = latestPendingPayment?.billingType === BILLING_TYPE.CREDIT_CARD;
  const isFutureRenewalCharge = Boolean(
    latestPendingPayment &&
    isLatestPaymentPendingOrOverdue &&
    isLatestPaymentFuture &&
    !isPendingUpgradeCharge,
  );
  const showPendingChargeCard = Boolean(
    latestPendingPayment && isLatestPaymentPendingOrOverdue && !isFutureRenewalCharge,
  );

  const confirmStripePaymentIfNeeded = async (payment: PendingPaymentDTO | null) => {
    if (!payment?.stripeClientSecret) return;

    if (!stripePublishableKey) {
      notifyError('Stripe is not configured for international payments.');
      return;
    }

    try {
      const stripe = await loadStripe(stripePublishableKey);
      if (!stripe) {
        notifyError('Stripe is not available. Please try again.');
        return;
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(payment.stripeClientSecret);
      if (error) {
        notifyError(error.message || 'Card authentication failed.');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        notifySuccess('Payment confirmed successfully');
        void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Unable to confirm Stripe payment.');
    }
  };

  const handleOpenChoice = (plan: PlanDTO) => {
    setSelectedPlan(plan);
    setChoiceCycle(billingCycle);
    setChoiceType(BILLING_TYPE.CREDIT_CARD);
    setCpfCnpj(formatCpfCnpj(savedCpfCnpj));
    setCpfCnpjError('');
    setStripeCardError('');
    updateMutation.reset();
    setIsChoiceModalOpen(true);
  };

  const handleConfirmChoice = async () => {
    if (!selectedPlan) return;

    // CPF/CNPJ is required for PIX and Boleto
    const effectiveBillingType = resolveEffectiveMonthlyBillingType(
      choiceCycle,
      hasCreditCardOnFile,
      choiceType,
    ) as BillingType;

    if (!isInternational && (effectiveBillingType === BILLING_TYPE.PIX || effectiveBillingType === BILLING_TYPE.BOLETO) && !cpfCnpj.trim()) {
      setCpfCnpjError(BILLING_ERROR_MESSAGES.CPF_CNPJ_REQUIRED);
      return;
    }

    // Validate CPF/CNPJ format
    if (!isInternational && cpfCnpj.trim() && !isValidCpfCnpjFormat(cpfCnpj)) {
      setCpfCnpjError(BILLING_ERROR_MESSAGES.INVALID_CPF_CNPJ_FORMAT);
      return;
    }

    let creditCardToken: string | undefined;
    if (requiresStripeCardCapture) {
      if (!stripePublishableKey) {
        setStripeCardError('Stripe is not configured for international payments.');
        return;
      }

      try {
        creditCardToken = await stripeCardRef.current?.createPaymentMethodId();
      } catch (error) {
        setStripeCardError(error instanceof Error ? error.message : 'Unable to validate card details.');
        return;
      }
    }

    const cleanCpfCnpj = cpfCnpj.replace(/\D/g, '');
    updateMutation.mutate({
      planId: selectedPlan.id,
      billingCycle: choiceCycle,
      billingType: effectiveBillingType,
      cpfCnpj: !isInternational ? (cleanCpfCnpj || undefined) : undefined,
      creditCardToken,
    });
  };

  const handleCopyPix = () => {
    if (!activePayment?.pixQrCode) return;
    void navigator.clipboard.writeText(activePayment.pixQrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshSubscription = () => {
    void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
    void queryClient.invalidateQueries({ queryKey: ['billing', 'plans'] });
  };

  const requestClosePaymentModal = () => {
    setIsPaymentCloseConfirmOpen(true);
  };

  const requestCloseChoiceModal = () => {
    setIsChoiceCloseConfirmOpen(true);
  };

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 14);
    const formatted = formatCpfCnpj(onlyDigits);
    setCpfCnpj(formatted);
    setCpfCnpjError('');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(isInternational ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: isInternational ? 'USD' : 'BRL',
    }).format(val);
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
              {plans.map(plan => {
                const isCurrent = plan.id === entitledPlanId;
                const isFree = plan.isDefault;

                // Calculate display price based on global state cycle selection and country
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

      {/* 1. Modal: Billing Cycle & Payment Selection */}
      {isChoiceModalOpen && selectedPlan && (
        <div className="modal-backdrop" onClick={requestCloseChoiceModal}>
          <section className="modal-panel integration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Choose billing options</h2>
                <p>Select cycle and payment details for <strong>{selectedPlan.name}</strong></p>
              </div>
              <button className="modal-close" type="button" onClick={requestCloseChoiceModal}>x</button>
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
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Billing Cycle</label>
                  <div className="cycle-selector" style={{ width: 'max-content' }}>
                    <button
                      type="button"
                      className={`cycle-btn ${choiceCycle === BILLING_CYCLE.MONTHLY ? 'active' : ''}`}
                      onClick={() => {
                        setChoiceCycle(BILLING_CYCLE.MONTHLY);
                        if (hasCreditCardOnFile) {
                          setChoiceType(BILLING_TYPE.CREDIT_CARD);
                        } else if (choiceType === BILLING_TYPE.BOLETO) {
                          setChoiceType(BILLING_TYPE.CREDIT_CARD);
                        }
                        setCpfCnpjError('');
                      }}
                    >
                      Monthly ({formatCurrency(!isInternational ? selectedPlan.price : selectedPlan.priceUsd)})
                    </button>
                    <button
                      type="button"
                      className={`cycle-btn ${choiceCycle === BILLING_CYCLE.YEARLY ? 'active' : ''}`}
                      onClick={() => {
                        setChoiceCycle(BILLING_CYCLE.YEARLY);
                        setCpfCnpjError('');
                      }}
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
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Payment Method</label>
                  <div className="billing-options-grid">
                    <div
                      className={`billing-option-card ${choiceType === BILLING_TYPE.CREDIT_CARD ? 'selected' : ''}`}
                      onClick={() => {
                        setChoiceType(BILLING_TYPE.CREDIT_CARD);
                        setCpfCnpjError('');
                      }}
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
                          onClick={() => {
                            setChoiceType(BILLING_TYPE.PIX);
                            setCpfCnpjError('');
                          }}
                        >
                          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.875 15.75a1.125 1.125 0 01-1.125-1.125v-1.5a1.125 1.125 0 011.125-1.125h1.5a1.125 1.125 0 011.125 1.125v1.5a1.125 1.125 0 01-1.125 1.125h-1.5z" />
                          </svg>
                          <span className="billing-option-label">PIX</span>
                        </div>

                        <div
                          className={`billing-option-card ${choiceType === BILLING_TYPE.BOLETO ? 'selected' : ''}`}
                          onClick={() => {
                            setChoiceType(BILLING_TYPE.BOLETO);
                            setCpfCnpjError('');
                          }}
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
                    onChange={handleCpfCnpjChange}
                    placeholder="000.000.000-00 or 00.000.000/0000-00"
                    aria-invalid={!!cpfCnpjError}
                    style={{ fontFamily: 'monospace' }}
                  />
                  {cpfCnpjError && (
                    <span className="form-error">
                      {cpfCnpjError}
                    </span>
                  )}
                  <span className="form-field-meta">
                    Required for invoice issuance
                  </span>
                </div>
              )}

              {requiresStripeCardCapture && stripePublishableKey && (
                <StripeCardCapture
                  ref={stripeCardRef}
                  publishableKey={stripePublishableKey}
                  disabled={updateMutation.isPending}
                />
              )}

              {requiresStripeCardCapture && !stripePublishableKey && (
                <InlineMessage tone="error">
                  Stripe is not configured for international card payments.
                </InlineMessage>
              )}

              {stripeCardError && (
                <InlineMessage tone="error">{stripeCardError}</InlineMessage>
              )}
            </div>



            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={requestCloseChoiceModal}>
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

      {isChoiceCloseConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setIsChoiceCloseConfirmOpen(false)}>
          <section className="modal-panel integration-modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Close billing options</h2>
                <p>Are you sure you want to close this modal? Your selections will be discarded.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsChoiceCloseConfirmOpen(false)}>x</button>
            </div>
            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={() => setIsChoiceCloseConfirmOpen(false)}>
                Keep editing
              </button>
              <button
                className="icon-button danger-button"
                type="button"
                onClick={() => {
                  setIsChoiceCloseConfirmOpen(false);
                  setIsChoiceModalOpen(false);
                }}
              >
                Yes, close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 2. Modal: Subscription Payment Details */}
      {isPaymentModalOpen && activePayment && (
        <div className="modal-backdrop" onClick={requestClosePaymentModal}>
          <section className="modal-panel integration-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Payment instructions</h2>
                <p>Complete the payment of {formatCurrency(activePayment.value)} to activate your subscription</p>
              </div>
              <button className="modal-close" type="button" onClick={requestClosePaymentModal}>x</button>
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
                      onClick={() => void confirmStripePaymentIfNeeded(activePayment)}
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
                onClick={requestClosePaymentModal}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {isPaymentCloseConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setIsPaymentCloseConfirmOpen(false)}>
          <section className="modal-panel integration-modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Close payment</h2>
                <p>Are you sure you want to close this payment? You can reopen it from the pending invoice banner.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsPaymentCloseConfirmOpen(false)}>x</button>
            </div>
            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={() => setIsPaymentCloseConfirmOpen(false)}>
                Keep open
              </button>
              <button
                className="icon-button danger-button"
                type="button"
                onClick={() => {
                  setIsPaymentCloseConfirmOpen(false);
                  setIsPaymentModalOpen(false);
                  setActivePayment(null);
                }}
              >
                Yes, close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 3. Modal: Cancel Scheduled Change Confirmation */}
      {isCancelScheduledModalOpen && summary?.scheduledChange && (
        <div className="modal-backdrop" onClick={() => setIsCancelScheduledModalOpen(false)}>
          <section className="modal-panel integration-modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Cancel Scheduled Change</h2>
                <p>Are you sure you want to cancel the scheduled plan change? Your subscription will continue as currently configured.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsCancelScheduledModalOpen(false)}>x</button>
            </div>
            <div className="form-actions">
              <button className="filter-chip" type="button" onClick={() => setIsCancelScheduledModalOpen(false)}>
                Keep scheduled change
              </button>
              <button
                className="icon-button danger-button"
                style={{ background: 'rgb(220, 38, 38)', color: '#ffffff', border: '1px solid rgb(220, 38, 38)' }}
                disabled={cancelChangeMutation.isPending}
                type="button"
                onClick={() => {
                  cancelChangeMutation.mutate(summary.scheduledChange!.id, {
                    onSuccess: () => {
                      setIsCancelScheduledModalOpen(false);
                    }
                  });
                }}
              >
                {cancelChangeMutation.isPending ? 'Canceling...' : 'Yes, cancel change'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
