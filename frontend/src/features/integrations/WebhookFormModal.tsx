import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createWebhookSubscription,
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
import { TriggerPicker } from './TriggerPicker';

const webhookFormSchema = z.object({
  label: z.string().trim().min(1, WEBHOOK_MESSAGES.VALIDATION.LABEL_REQUIRED).max(100),
  url: z.string().trim().url(WEBHOOK_MESSAGES.VALIDATION.URL_INVALID),
  secret: z.string().max(256),
  events: z.array(z.string()).min(1, WEBHOOK_MESSAGES.VALIDATION.EVENTS_REQUIRED),
});
type WebhookFormValues = z.infer<typeof webhookFormSchema>;

interface WebhookFormModalProps {
  workspaceSlug: string;
  triggers: WebhookTriggerDefinition[];
  editing: WebhookSubscription | null;
  onClose: () => void;
}

export function WebhookFormModal({ workspaceSlug, triggers, editing, onClose }: WebhookFormModalProps) {
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
              <div className="card-kicker">{WEBHOOK_MESSAGES.FORM.KICKER}</div>
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
