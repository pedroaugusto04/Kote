import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  fetchWebhookSubscriptions,
  fetchWebhookTriggers,
  updateWebhookSubscription,
} from '../../shared/api/client';
import type { WebhookSubscription, WebhookTriggerDefinition } from '../../shared/api/models/webhook-subscription';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions, FormField } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { WEBHOOK_MESSAGES } from './webhook.constants';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { Badge, EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';

// ---------------------------------------------------------------------------
// Zod form schema
// ---------------------------------------------------------------------------
const webhookFormSchema = z.object({
  label: z.string().trim().min(1, WEBHOOK_MESSAGES.VALIDATION.LABEL_REQUIRED).max(100),
  url: z.string().trim().url(WEBHOOK_MESSAGES.VALIDATION.URL_INVALID),
  secret: z.string().max(256),
  events: z.array(z.string()).min(1, WEBHOOK_MESSAGES.VALIDATION.EVENTS_REQUIRED),
});
type WebhookFormValues = z.infer<typeof webhookFormSchema>;

// ---------------------------------------------------------------------------
// Trigger picker (checkboxes grouped by group)
// ---------------------------------------------------------------------------
function TriggerPicker({
  triggers,
  selected,
  onChange,
  disabled = false,
}: {
  triggers: WebhookTriggerDefinition[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const groups: Record<string, WebhookTriggerDefinition[]> = {};
  for (const t of triggers) (groups[t.group] ??= []).push(t);

  const toggle = (trigger: string) => {
    onChange(
      selected.includes(trigger)
        ? selected.filter((s) => s !== trigger)
        : [...selected, trigger],
    );
  };

  return (
    <div className="webhook-trigger-picker">
      {Object.entries(groups).map(([group, items]) => (
        <fieldset key={group} className="webhook-trigger-group">
          <legend>{group.charAt(0).toUpperCase() + group.slice(1)}</legend>
          {items.map((t) => (
            <label key={t.trigger} className="webhook-trigger-option">
              <input
                checked={selected.includes(t.trigger)}
                disabled={disabled}
                type="checkbox"
                onChange={() => toggle(t.trigger)}
              />
              <span>
                <strong>{t.label}</strong>
                <small>{t.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------
function WebhookFormModal({
  workspaceSlug,
  triggers,
  editing,
  onClose,
}: {
  workspaceSlug: string;
  triggers: WebhookTriggerDefinition[];
  editing: WebhookSubscription | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookFormSchema),
    shouldFocusError: false,
    defaultValues: {
      label: editing?.label ?? '',
      url: editing?.url ?? '',
      secret: '',
      events: editing?.events ?? [],
    },
  });
  const selectedEvents = watch('events');
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  const mutation = useMutation({
    mutationFn: async (values: WebhookFormValues) => {
      if (editing) {
        return updateWebhookSubscription(editing.id, {
          label: values.label,
          url: values.url,
          secret: values.secret || undefined,
          events: values.events,
        });
      }
      return createWebhookSubscription({
        workspaceSlug,
        label: values.label || '',
        url: values.url,
        secret: values.secret || undefined,
        events: values.events,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions', workspaceSlug] });
      notifySuccess(editing ? WEBHOOK_MESSAGES.MUTATION.UPDATED : WEBHOOK_MESSAGES.MUTATION.CREATED);
      closeGuard.resetCloseGuard();
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<WebhookFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, WEBHOOK_MESSAGES.MUTATION.ERROR);
    },
  });

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section
          aria-labelledby="webhook-form-title"
          aria-modal="true"
          className="modal-panel integration-modal"
          role="dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <div className="card-kicker">webhook</div>
              <h2 id="webhook-form-title">{editing ? WEBHOOK_MESSAGES.FORM.EDIT_TITLE : WEBHOOK_MESSAGES.FORM.NEW_TITLE}</h2>
            </div>
            <button aria-label={WEBHOOK_MESSAGES.CLOSE} className="modal-close" type="button" onClick={closeGuard.requestClose}>×</button>
          </div>

          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <FormField name="label" label={WEBHOOK_MESSAGES.FORM.LABEL} required={true} error={errors.label?.message}>
              {(props) => <input className="form-input" {...props} {...register('label')} placeholder={UI_MESSAGES.PRODUCTION_WEBHOOK} />}
            </FormField>
            <FormField name="url" label={WEBHOOK_MESSAGES.FORM.ENDPOINT_URL} error={errors.url?.message}>
              {(props) => <input className="form-input" {...props} {...register('url')} placeholder={UI_MESSAGES.EXAMPLE_WEBHOOK_URL} />}
            </FormField>
            <FormField name="secret" label={editing ? WEBHOOK_MESSAGES.FORM.SECRET_NEW : WEBHOOK_MESSAGES.FORM.SECRET_CREATE} error={errors.secret?.message}>
              {(props) => <input className="form-input" {...props} {...register('secret')} type="password" autoComplete="off" />}
            </FormField>

            <div data-field="events">
              <label className="field-label">{WEBHOOK_MESSAGES.FORM.EVENTS}</label>
              <TriggerPicker
                triggers={triggers}
                selected={selectedEvents}
                onChange={(next) => setValue('events', next, { shouldDirty: true, shouldValidate: true })}
                disabled={mutation.isPending}
              />
              {errors.events?.message ? <p className="form-error" role="alert">{errors.events.message}</p> : null}
            </div>

            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={editing ? WEBHOOK_MESSAGES.FORM.SAVE : WEBHOOK_MESSAGES.FORM.CREATE} />
          </form>
        </section>
      </div>
      {closeGuard.isDiscardConfirmationOpen ? (
        <ConfirmationModal
          cancelLabel={discardChangesConfirmationCopy.cancelLabel}
          confirmLabel={discardChangesConfirmationCopy.confirmLabel}
          description={discardChangesConfirmationCopy.description}
          onCancel={closeGuard.cancelClose}
          onConfirm={closeGuard.confirmClose}
          title={discardChangesConfirmationCopy.title}
          tone="default"
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Subscription row
// ---------------------------------------------------------------------------
function SubscriptionRow({
  subscription,
  workspaceSlug,
  onEdit,
}: {
  subscription: WebhookSubscription;
  workspaceSlug: string;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: () => updateWebhookSubscription(subscription.id, { enabled: !subscription.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions', workspaceSlug] }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteWebhookSubscription(subscription.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions', workspaceSlug] });
      notifySuccess(WEBHOOK_MESSAGES.MUTATION.DELETED);
    },
  });

  return (
    <>
      <div className="webhook-row">
        <div className="webhook-row-main">
          <strong>{subscription.label || subscription.url}</strong>
          <small className="mono">{subscription.url}</small>
        </div>
        <div className="webhook-row-actions">
          <Badge value={subscription.enabled ? WEBHOOK_MESSAGES.ROW.ACTIVE : WEBHOOK_MESSAGES.ROW.DISABLED} tone={subscription.enabled ? 'low' : 'medium'} />
          <button
            className="filter-chip"
            disabled={toggleMutation.isPending}
            type="button"
            onClick={() => toggleMutation.mutate()}
          >
            {subscription.enabled ? WEBHOOK_MESSAGES.ROW.DISABLE : WEBHOOK_MESSAGES.ROW.ENABLE}
          </button>
          <button
            className="row-action-button"
            title={WEBHOOK_MESSAGES.ROW.EDIT}
            type="button"
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            className="row-action-button danger"
            title={WEBHOOK_MESSAGES.ROW.DELETE}
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      {confirmDelete ? (
        <ConfirmationModal
          cancelLabel={WEBHOOK_MESSAGES.DELETE_CONFIRMATION.CANCEL}
          confirmLabel={WEBHOOK_MESSAGES.DELETE_CONFIRMATION.CONFIRM}
          description={WEBHOOK_MESSAGES.DELETE_CONFIRMATION.DESCRIPTION.replace('{label}', subscription.label || subscription.url)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { deleteMutation.mutate(); setConfirmDelete(false); }}
          title={WEBHOOK_MESSAGES.DELETE_CONFIRMATION.TITLE}
          tone="danger"
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------
export function WebhookSubscriptionsCard({ workspaceSlug }: { workspaceSlug: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<WebhookSubscription | null>(null);

  const triggersQuery = useQuery({
    queryKey: ['webhook-triggers'],
    queryFn: fetchWebhookTriggers,
    staleTime: Infinity,
  });
  const subscriptionsQuery = useQuery({
    queryKey: ['webhook-subscriptions', workspaceSlug],
    queryFn: () => fetchWebhookSubscriptions(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });

  const triggers = triggersQuery.data?.triggers ?? [];
  const subscriptions = subscriptionsQuery.data ?? [];

  const openCreate = () => { setEditingSubscription(null); setShowForm(true); };
  const openEdit = (sub: WebhookSubscription) => { setEditingSubscription(sub); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingSubscription(null); };

  return (
    <>
      <Panel className="integration-card webhook-card">
        <div className="integration-card-head">
          <div className="integration-logo-fallback">WH</div>
          <div>
            <h2>{WEBHOOK_MESSAGES.CARD.TITLE}</h2>
            <p>{WEBHOOK_MESSAGES.CARD.DESCRIPTION}</p>
          </div>
        </div>

        <div className="integration-card-body">
          {subscriptionsQuery.isLoading ? <p className="meta">{WEBHOOK_MESSAGES.CARD.LOADING}</p> : null}
          {subscriptionsQuery.isError ? <InlineMessage tone="error">{WEBHOOK_MESSAGES.CARD.ERROR}</InlineMessage> : null}
          {!subscriptionsQuery.isLoading && subscriptions.length === 0 ? (
            <EmptyState>{WEBHOOK_MESSAGES.CARD.EMPTY}</EmptyState>
          ) : null}
          {subscriptions.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              subscription={sub}
              workspaceSlug={workspaceSlug}
              onEdit={() => openEdit(sub)}
            />
          ))}
        </div>

        <div className="integration-card-foot">
          <Badge value={WEBHOOK_MESSAGES.CARD.COUNT.replace('{count}', String(subscriptions.length)).replace('{plural}', subscriptions.length === 1 ? '' : 's')} tone="low" />
          <div className="integration-actions">
            <button className="icon-button" type="button" onClick={openCreate}>{WEBHOOK_MESSAGES.CARD.NEW_BUTTON}</button>
          </div>
        </div>
      </Panel>

      {showForm ? (
        <WebhookFormModal
          workspaceSlug={workspaceSlug}
          triggers={triggers}
          editing={editingSubscription}
          onClose={closeForm}
        />
      ) : null}
    </>
  );
}
