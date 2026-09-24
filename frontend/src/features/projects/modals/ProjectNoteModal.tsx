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

  const hasInitialAttachments = Boolean(
    initialAttachments && initialAttachments.length > 0
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
    watch,
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

  const watchedCategoryIds = watch('categoryIds') || [];
  const watchedTags = watch('tags') || [];
  const watchedReminderAt = watch('reminderAt') || '';

  const [showCategories, setShowCategories] = useState(
    Boolean(note?.categories && note.categories.length > 0)
  );
  const [showTags, setShowTags] = useState(
    Boolean(note?.tags && note.tags.length > 0)
  );
  const [showReminder, setShowReminder] = useState(
    Boolean(note?.editor?.reminderAt)
  );

  const attachmentError = useMemo<string | undefined>(() => {
    if (!errors.attachments) return undefined;
    if (typeof errors.attachments.message === 'string') return errors.attachments.message;
    const errArray = errors.attachments as unknown as Array<Record<string, { message?: string }> | undefined>;
    if (Array.isArray(errArray)) {
      const firstErr = errArray.find(Boolean);
      const msg = firstErr?.mimeType?.message || firstErr?.sizeBytes?.message || (typeof firstErr?.message === 'string' ? firstErr.message : undefined);
      return typeof msg === 'string' ? msg : undefined;
    }
    return undefined;
  }, [errors.attachments]);

  const isCategoriesVisible = showCategories || watchedCategoryIds.length > 0 || Boolean(errors.categoryIds);
  const isTagsVisible = showTags || watchedTags.length > 0 || Boolean(errors.tags);
  const isReminderVisible = showReminder || Boolean(watchedReminderAt) || Boolean(errors.reminderAt);

  const closeGuard = useModalCloseGuard({
    isDirty: isDirty || hasInitialAttachments,
    onClose,
  });
  const mutation = useMutation({
    mutationFn: async (values: NoteFormValues) => {
      const payload = {
        folderId: values.folderId || undefined,
        categoryIds: values.categoryIds,
        title: values.title,
        rawText: values.rawText,
        tags: values.tags,
        reminderAt: reminderAtToUtc(values.reminderAt),
      };
      const result = mode === WorkspaceModalMode.Create
        ? createNote({ ...payload, projectSlug: selectedProjectSlug, source: 'manual', attachments })
        : updateNote(note?.id || '', { ...payload, projectSlug: selectedProjectSlug, attachments });

      return globalLoading.trackPromise(
        result.then(async (res) => {
          closeGuard.resetCloseGuard();
          await onSaved(res.noteId, mode);
          return res;
        })
      );
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

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!mutation.isPending) {
        void handleSubmit(
          (values: NoteFormValues) => mutation.mutate(values),
          (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
        )();
      }
    }
  };

  const hasProjectSelector = Boolean(projects && projects.length > 0);

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="note-modal-title" aria-modal="true" className="modal-panel integration-modal project-note-modal-panel" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="note-modal-title">{mode === WorkspaceModalMode.Create ? UI_MESSAGES.NEW_NOTE : UI_MESSAGES.EDIT_NOTE}</h2>
              {!hasProjectSelector && <p>{selectedProjectSlug}</p>}
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onKeyDown={handleFormKeyDown}
            onSubmit={handleSubmit(
              (values: NoteFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            {/* 1. Capture First: Title and Text */}
            <FormField name="title" label="Title" error={errors.title?.message} required>
              {(fieldProps) => (
                <input
                  placeholder="Note title (e.g. Local environment setup)"
                  autoFocus={mode === WorkspaceModalMode.Create}
                  {...fieldProps}
                  {...register('title')}
                />
              )}
            </FormField>
            <FormField name="rawText" label="Text" error={errors.rawText?.message} optional>
              {(fieldProps) => <textarea placeholder="Write note content in Markdown..." rows={3} {...fieldProps} {...register('rawText')} />}
            </FormField>

            {/* 2. Context Row: Project and Folder in compact 2-column grid */}
            <div className={hasProjectSelector ? 'form-grid' : ''}>
              {hasProjectSelector && (
                <FormField name="projectSlug" label="Project" required={mode === WorkspaceModalMode.Create}>
                  {(fieldProps) => (
                    <Select
                      ariaDescribedBy={fieldProps['aria-describedby']}
                      ariaInvalid={fieldProps['aria-invalid']}
                      ariaRequired={fieldProps['aria-required']}
                      dataField={fieldProps['data-field']}
                      id={fieldProps.id}
                      options={projects!.map((project) => ({
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
            </div>

            {/* 3. Progressive Disclosure Meta Toolbar */}
            <div className="quick-note-meta-triggers" role="toolbar" aria-label="Add note details">
              <button
                type="button"
                className={`meta-toggle-btn ${isCategoriesVisible ? 'active' : ''}`}
                onClick={() => setShowCategories((v) => !v)}
                aria-expanded={isCategoriesVisible}
                title="Toggle categories"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M1.5 8.5L8.5 1.5H14.5V7.5L7.5 14.5L1.5 8.5Z" />
                  <circle cx="11.5" cy="4.5" r="1" fill="currentColor" />
                </svg>
                <span>{watchedCategoryIds.length > 0 ? `${watchedCategoryIds.length} categories` : '+ Category'}</span>
              </button>

              <button
                type="button"
                className={`meta-toggle-btn ${isTagsVisible ? 'active' : ''}`}
                onClick={() => setShowTags((v) => !v)}
                aria-expanded={isTagsVisible}
                title="Toggle tags"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <line x1="2.5" y1="6" x2="13.5" y2="6" />
                  <line x1="2.5" y1="10" x2="13.5" y2="10" />
                  <line x1="6" y1="2.5" x2="4.5" y2="13.5" />
                  <line x1="11.5" y1="2.5" x2="10" y2="13.5" />
                </svg>
                <span>{watchedTags.length > 0 ? `${watchedTags.length} tags` : '+ Tags'}</span>
              </button>

              <button
                type="button"
                className={`meta-toggle-btn ${isReminderVisible ? 'active' : ''}`}
                onClick={() => setShowReminder((v) => !v)}
                aria-expanded={isReminderVisible}
                title="Toggle reminder"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <circle cx="8" cy="8" r="6" />
                  <polyline points="8 4.5 8 8 10.5 9.5" />
                </svg>
                <span>{watchedReminderAt ? 'Reminder set' : '+ Reminder'}</span>
              </button>
            </div>

            {/* 4. Conditionally Expanded Sections */}
            {isCategoriesVisible && (
              <div className="quick-note-section-card">
                <FormField name="categoryIds" label="Categories" error={errors.categoryIds?.message} optional>
                  {(fieldProps) => (
                    <Controller
                      control={control}
                      name="categoryIds"
                      render={({ field }) => (
                        <div className="categories-pill-list">
                          {categoriesQuery.data?.map((category) => {
                            const checked = field.value?.includes(category.id);
                            return (
                              <label
                                key={category.id}
                                className={`category-chip ${checked ? 'selected' : ''}`}
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
                                    '--dot-color-light': category.color || '#94a3b8',
                                    '--dot-color-dark': category.colorDark || category.color || '#94a3b8',
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
              </div>
            )}

            {(isTagsVisible || isReminderVisible) && (
              <div className={isTagsVisible && isReminderVisible ? 'form-grid' : ''}>
                {isTagsVisible && (
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
                )}
                {isReminderVisible && (
                  <FormField name="reminderAt" label="Reminder" error={errors.reminderAt?.message} optional>
                    {(fieldProps) => <input type="datetime-local" {...fieldProps} {...register('reminderAt')} />}
                  </FormField>
                )}
              </div>
            )}

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
