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
} from '../../../shared/api/billing';
import { type StripeCardCaptureHandle } from '../StripeCardCapture';
import { formatCpfCnpj, isValidCpfCnpjFormat } from '../../../shared/utils/cpf-cnpj';
import { detectUserCountry } from '../../../shared/utils/location';
import { useGlobalLoading } from '../../../app/global-loading';
import { BILLING_ERROR_MESSAGES, BILLING_CYCLE, BILLING_TYPE, SUBSCRIPTION_CHANGE_KIND, SUBSCRIPTION_STATUS, type BillingCycle, type BillingType } from '../../../shared/constants/billing.constants';
import {
  canChooseManualMonthlyPayment,
  isManualBillingType,
  isOpenSubscriptionStatus,
  mergePendingPayment,
  pendingChargeStatus,
  resolveEffectiveMonthlyBillingType,
  toUtcDateOnlyTimestamp,
} from '../../../shared/utils/billing/subscription-ui';
import { notifySuccess, notifyError } from '../../../shared/ui/notifications';

export function useSubscriptionBilling() {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();

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
    mutationFn: (params: Parameters<typeof updateSubscription>[0]) =>
      globalLoading.trackPromise(updateSubscription(params)),
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
      day: 'numeric',
    });
  };

  const isLoading = plansQuery.isLoading || statusQuery.isLoading;

  return {
    isBrazil,
    isInternational,
    onlyStripe,
    stripePublishableKey,
    billingCycle,
    setBillingCycle,
    selectedPlan,
    setSelectedPlan,
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
  };
}
