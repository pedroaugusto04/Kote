import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { formatDisplayToken, reminderInputDate, reminderInputTime } from '../../../entities/format';
import { createNote, updateNote } from '../../../shared/api/client';
import type { NoteDetail } from '../../../shared/api/models/note';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../../shared/forms/errors';
import { FormActions, FormField } from '../../../shared/forms/fields';
import { parseCommaSeparatedList } from '../../../shared/forms/normalizers';
import { ConfirmationModal } from '../../../shared/ui/confirmation-modal';
import { Select } from '../../../shared/ui/select';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../../shared/ui/use-modal-close-guard';
import { useGlobalLoading } from '../../../app/global-loading';
import { noteFormSchema, type NoteFormValues } from '../projects.forms';
import type { FlatProjectFolder } from '../projects.types';

const canonicalTypeOptions = ['event', 'decision', 'followup', 'incident', 'knowledge'].map((value) => ({
  value,
  label: formatDisplayToken(value),
}));

type ProjectNoteModalProps = {
  folders: FlatProjectFolder[];
  mode: 'create' | 'edit';
  note?: NoteDetail;
  onClose: () => void;
  onSaved: (noteId: string, mode: 'create' | 'edit') => void | Promise<void>;
  projectSlug: string;
  initialFolderId?: string;
};

export function ProjectNoteModal({
  folders,
  mode,
  note,
  onClose,
  onSaved,
  projectSlug,
  initialFolderId,
}: ProjectNoteModalProps) {
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors, isDirty },
    control,
    handleSubmit,
    register,
    setError,
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    shouldFocusError: false,
    defaultValues: {
      folderId: note?.folderId || initialFolderId || '',
      canonicalType: note?.type === 'decision' || note?.type === 'followup' || note?.type === 'incident' || note?.type === 'knowledge' ? note.type : 'event',
      title: note?.title || '',
      rawText: note?.editor?.rawText || '',
      tags: note?.tags.join(', ') || '',
      reminderDate: note?.editor ? reminderInputDate(note.editor) : '',
      reminderTime: note?.editor ? reminderInputTime(note.editor) : '',
    },
  });
  const closeGuard = useModalCloseGuard({ isDirty, onClose });
  const mutation = useMutation({
    mutationFn: (values: NoteFormValues) => {
      const payload = {
        folderId: values.folderId || undefined,
        canonicalType: values.canonicalType,
        title: values.title,
        rawText: values.rawText,
        tags: parseCommaSeparatedList(values.tags),
        reminderDate: values.reminderDate,
        reminderTime: values.reminderTime,
      };
      return globalLoading.trackPromise(mode === 'create'
        ? createNote({ ...payload, projectSlug })
        : updateNote(note?.id || '', payload));
    },
    onSuccess: async (result) => {
      closeGuard.resetCloseGuard();
      await onSaved(result.noteId, mode);
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<NoteFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, mode === 'create' ? 'Could not create the note.' : 'Could not update the note.');
    },
  });

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="note-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="note-modal-title">{mode === 'create' ? 'New note' : 'Edit note'}</h2>
              <p>{projectSlug}</p>
            </div>
            <button aria-label="Close details" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values: NoteFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <FormField name="folderId" label="Folder" error={errors.folderId?.message} optional>
              {(fieldProps) => (
                <Controller
                  control={control}
                  name="folderId"
                  render={({ field }) => (
                    <Select
                      ariaDescribedBy={fieldProps['aria-describedby']}
                      ariaInvalid={fieldProps['aria-invalid']}
                      ariaRequired={fieldProps['aria-required']}
                      dataField={fieldProps['data-field']}
                      id={fieldProps.id}
                      options={[
                        { value: '', label: 'Root' },
                        ...folders.map((folder) => ({
                          value: folder.id,
                          label: folder.displayName,
                          depth: folder.depth,
                        })),
                      ]}
                      required={fieldProps.required}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </FormField>
            <FormField name="canonicalType" label="Type" error={errors.canonicalType?.message} required>
              {(fieldProps) => (
                <Controller
                  control={control}
                  name="canonicalType"
                  render={({ field }) => (
                    <Select
                      ariaDescribedBy={fieldProps['aria-describedby']}
                      ariaInvalid={fieldProps['aria-invalid']}
                      ariaRequired={fieldProps['aria-required']}
                      dataField={fieldProps['data-field']}
                      id={fieldProps.id}
                      options={canonicalTypeOptions}
                      required={fieldProps.required}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </FormField>
            <FormField name="title" label="Title" error={errors.title?.message} optional>
              {(fieldProps) => <input {...fieldProps} {...register('title')} />}
            </FormField>
            <FormField name="rawText" label="Text" error={errors.rawText?.message} required>
              {(fieldProps) => <textarea {...fieldProps} {...register('rawText')} />}
            </FormField>
            <FormField name="tags" label="Tags" error={errors.tags?.message} optional>
              {(fieldProps) => <input {...fieldProps} {...register('tags')} />}
            </FormField>
            <div className="form-grid">
              <FormField name="reminderDate" label="Reminder date" error={errors.reminderDate?.message} optional>
                {(fieldProps) => <input type="date" {...fieldProps} {...register('reminderDate')} />}
              </FormField>
              <FormField name="reminderTime" label="Reminder time" error={errors.reminderTime?.message} optional>
                {(fieldProps) => <input type="time" {...fieldProps} {...register('reminderTime')} />}
              </FormField>
            </div>
            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === 'create' ? 'Create note' : 'Save note'} />
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
