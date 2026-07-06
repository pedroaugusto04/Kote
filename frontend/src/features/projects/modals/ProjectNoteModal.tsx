import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { formatDisplayToken, reminderInputDateTime, reminderAtToUtc } from '../../../shared/utils/format';
import { UI_MESSAGES } from '../../../shared/constants/ui.constants';
import { createNote, updateNote, fetchProjectFolders, fetchWorkspaceCategories } from '../../../shared/api/client';
import type { NoteDetail } from '../../../shared/api/models/note';
import type { Project } from '../../../shared/api/models/project';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../../shared/forms/errors';
import { FormActions, FormField } from '../../../shared/forms/fields';
import { ConfirmationModal } from '../../../shared/ui/confirmation-modal';
import { Select } from '../../../shared/ui/select';
import { TagInput } from '../../../shared/ui/tag-input';
import { AttachmentInput, type PendingAttachment } from '../../../shared/ui/attachment-input';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../../shared/ui/use-modal-close-guard';
import { useGlobalLoading } from '../../../app/global-loading';
import { noteFormSchema, type NoteFormValues } from '../projects.forms';
import type { FlatProjectFolder } from '../projects.types';
import { WorkspaceModalMode } from '../projects.types';
import { flattenFolders } from '../projects.helpers';

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

type ProjectNoteModalProps = {
  folders?: FlatProjectFolder[];
  mode: WorkspaceModalMode;
  note?: NoteDetail;
  onClose: () => void;
  onSaved: (noteId: string, mode: WorkspaceModalMode) => void | Promise<void>;
  projectSlug: string;
  initialFolderId?: string;
  projects?: Project[];
  workspaceSlug: string;
  initialTitle?: string;
  initialAttachments?: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }>;
};

export function ProjectNoteModal({
  folders,
  mode,
  note,
  onClose,
  onSaved,
  projectSlug,
  initialFolderId,
  projects,
  workspaceSlug,
  initialTitle,
  initialAttachments,
}: ProjectNoteModalProps) {
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState(
    mode === WorkspaceModalMode.Edit && note ? note.project : projectSlug
  );

  const [attachments, setAttachments] = useState<PendingAttachment[]>(
    initialAttachments || []
  );

  const foldersQuery = useQuery({
    queryKey: ['project-folders', 'modal', selectedProjectSlug],
    queryFn: () => fetchProjectFolders(selectedProjectSlug),
    enabled: Boolean(selectedProjectSlug) && (!folders || selectedProjectSlug !== projectSlug),
  });

  const categoriesQuery = useQuery({
    queryKey: ['workspace-categories', workspaceSlug],
    queryFn: () => fetchWorkspaceCategories(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });

  const modalFolders = useMemo(
    () => (selectedProjectSlug === projectSlug && folders) ? folders : flattenFolders(foldersQuery.data?.folders || []),
    [folders, selectedProjectSlug, projectSlug, foldersQuery.data?.folders],
  );

  const {
    formState: { errors, isDirty },
    control,
    handleSubmit,
    register,
    setError,
    setValue,
    clearErrors,
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    shouldFocusError: false,
    defaultValues: {
      folderId: note?.folderId || initialFolderId || '',
      categoryIds: note?.categories?.map((c) => c.id) || [],
      title: note?.title || initialTitle || '',
      rawText: note?.editor?.rawText || initialTitle || '',
      tags: note?.tags || [],
      reminderAt: reminderInputDateTime({ reminderAt: note?.editor?.reminderAt }),
      attachments: initialAttachments || [],
    },
  });

  const attachmentError = useMemo(() => {
    if (!errors.attachments) return undefined;
    if (errors.attachments.message) return errors.attachments.message;
    const errArray = errors.attachments as any;
    if (Array.isArray(errArray)) {
      const firstErr = errArray.find(Boolean);
      return firstErr?.mimeType?.message || firstErr?.sizeBytes?.message || firstErr?.message;
    }
    return undefined;
  }, [errors.attachments]);

  const closeGuard = useModalCloseGuard({ isDirty, onClose });
  const mutation = useMutation({
    mutationFn: (values: NoteFormValues) => {
      const payload = {
        folderId: values.folderId || undefined,
        categoryIds: values.categoryIds,
        title: values.title,
        rawText: values.rawText,
        tags: values.tags,
        reminderAt: reminderAtToUtc(values.reminderAt),
      };
      return globalLoading.trackPromise(mode === WorkspaceModalMode.Create
        ? createNote({ ...payload, projectSlug: selectedProjectSlug, source: 'manual', attachments })
        : updateNote(note?.id || '', { ...payload, projectSlug: selectedProjectSlug, attachments }));
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
      notifyGeneralFormError(error, mode === WorkspaceModalMode.Create ? 'Could not create the note.' : 'Could not update the note.');
    },
  });

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="note-modal-title" aria-modal="true" className="modal-panel integration-modal project-note-modal-panel" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="note-modal-title">{mode === WorkspaceModalMode.Create ? UI_MESSAGES.NEW_NOTE : UI_MESSAGES.EDIT_NOTE}</h2>
              {!(projects && projects.length > 0) && <p>{selectedProjectSlug}</p>}
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
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
            {projects && projects.length > 0 && (
              <FormField name="projectSlug" label="Project" required={mode === WorkspaceModalMode.Create}>
                {(fieldProps) => (
                  <Select
                    ariaDescribedBy={fieldProps['aria-describedby']}
                    ariaInvalid={fieldProps['aria-invalid']}
                    ariaRequired={fieldProps['aria-required']}
                    dataField={fieldProps['data-field']}
                    id={fieldProps.id}
                    options={projects.map((project) => ({
                      value: project.projectSlug,
                      label: project.displayName,
                    }))}
                    required={fieldProps.required}
                    value={selectedProjectSlug}
                    onChange={(val) => {
                      setSelectedProjectSlug(val);
                      setValue('folderId', '');
                    }}
                  />
                )}
              </FormField>
            )}
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
                        ...modalFolders.map((folder) => ({
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
            <FormField name="categoryIds" label="Categories" error={errors.categoryIds?.message} optional>
              {(fieldProps) => (
                <Controller
                  control={control}
                  name="categoryIds"
                  render={({ field }) => (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0' }}>
                      {categoriesQuery.data?.map((category) => {
                        const checked = field.value?.includes(category.id);
                        return (
                          <label
                            key={category.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '20px',
                              border: checked ? '1px solid var(--text)' : '1px solid var(--border)',
                              cursor: 'pointer',
                              backgroundColor: checked ? 'var(--bg-accent)' : 'var(--bg)',
                              transition: 'all 0.2s ease',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              value={category.id}
                              style={{ display: 'none' }}
                              onChange={() => {
                                const nextValue = checked
                                  ? (field.value || []).filter((id) => id !== category.id)
                                  : [...(field.value || []), category.id];
                                field.onChange(nextValue);
                              }}
                            />
                            <span
                              className="category-dot"
                              style={{
                                '--dot-color-light': category.color || '#cccccc',
                                '--dot-color-dark': category.colorDark || category.color || '#cccccc'
                              } as React.CSSProperties}
                            />
                            <span>{formatDisplayToken(category.name)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
              )}
            </FormField>
            <FormField name="title" label="Title" error={errors.title?.message} required>
              {(fieldProps) => <input {...fieldProps} {...register('title')} />}
            </FormField>
            <FormField name="rawText" label="Text" error={errors.rawText?.message} optional>
              {(fieldProps) => <textarea {...fieldProps} {...register('rawText')} />}
            </FormField>
            <FormField name="attachments" label="Attachments" error={attachmentError} optional>
              {() => (
                <AttachmentInput
                  value={attachments}
                  onChange={(newAttachments) => {
                    setAttachments(newAttachments);
                    setValue('attachments', newAttachments, { shouldDirty: true });
                    clearErrors('attachments');
                  }}
                  disabled={mutation.isPending}
                />
              )}
            </FormField>
            <FormField name="tags" label="Tags" error={errors.tags?.message} optional>
              {(fieldProps) => (
                <Controller
                  control={control}
                  name="tags"
                  render={({ field }) => (
                    <TagInput
                      {...fieldProps}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      maxTags={MAX_TAGS}
                      maxTagLength={MAX_TAG_LENGTH}
                    />
                  )}
                />
              )}
            </FormField>
            <div className="form-grid">
              <FormField name="reminderAt" label="Reminder" error={errors.reminderAt?.message} optional>
                {(fieldProps) => <input type="datetime-local" {...fieldProps} {...register('reminderAt')} />}
              </FormField>
            </div>
            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === WorkspaceModalMode.Create ? 'Create note' : 'Save note'} />
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
