import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createProject, updateProject } from '../../../shared/api/client';
import { UI_MESSAGES } from '../../../shared/constants/ui.constants';
import type { GithubIntegrationRepository } from '../../../shared/api/models/integration';
import type { Project } from '../../../shared/api/models/project';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../../shared/forms/errors';
import { FormActions, FormField } from '../../../shared/forms/fields';
import { ConfirmationModal } from '../../../shared/ui/confirmation-modal';
import { TagInput } from '../../../shared/ui/tag-input';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../../shared/ui/use-modal-close-guard';
import { useGlobalLoading } from '../../../app/global-loading';
import { projectFormSchema, type ProjectFormValues } from '../projects.forms';
import { WorkspaceModalMode } from '../projects.types';

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

type ProjectModalProps = {
  githubConnected: boolean;
  workspaceRepositories: GithubIntegrationRepository[];
  mode: WorkspaceModalMode;
  project?: Project;
  onClose: () => void;
  onSaved: (projectSlug: string, mode: WorkspaceModalMode) => void | Promise<void>;
};

export function ProjectModal({
  githubConnected,
  workspaceRepositories,
  mode,
  project,
  onClose,
  onSaved,
}: ProjectModalProps) {
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    shouldFocusError: false,
    defaultValues: {
      displayName: project?.displayName || '',
      projectSlug: project?.projectSlug || '',
      repositoryIds: project?.repositories.map((repository) => repository.externalId) || [],
      defaultTags: project?.defaultTags || [],
    },
  });

  const watchedDefaultTags = watch('defaultTags') || [];

  const [showTags, setShowTags] = useState(
    Boolean(project?.defaultTags && project.defaultTags.length > 0)
  );

  const isTagsVisible = showTags || watchedDefaultTags.length > 0 || Boolean(errors.defaultTags);

  const closeGuard = useModalCloseGuard({ isDirty, onClose });
  const mutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const payload = {
        displayName: values.displayName,
        repositoryIds: values.repositoryIds,
        defaultTags: values.defaultTags,
      };
      const result = mode === WorkspaceModalMode.Create
        ? createProject({ ...payload, projectSlug: values.projectSlug || undefined })
        : updateProject(project?.projectSlug || '', payload);
      
      return globalLoading.trackPromise(
        result.then(async (res) => {
          closeGuard.resetCloseGuard();
          await onSaved(res.project.projectSlug, mode);
          return res;
        })
      );
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<ProjectFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, mode === WorkspaceModalMode.Create ? 'Could not create the project.' : 'Could not update the project.');
    },
  });

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!mutation.isPending) {
        void handleSubmit(
          (values: ProjectFormValues) => mutation.mutate(values),
          (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
        )();
      }
    }
  };

  const hasRepositoryOptions = workspaceRepositories.length > 0;
  const repositoryHint = 'Select one or more repositories linked to the workspace.';
  const repositoryPlaceholder = !githubConnected
    ? 'Connect GitHub in Integrations to list and select repositories.'
    : 'No repositories available in this workspace. Check the selection in Integrations > GitHub.';

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="project-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="project-modal-title">{mode === WorkspaceModalMode.Create ? UI_MESSAGES.NEW_PROJECT : UI_MESSAGES.EDIT_PROJECT}</h2>
              <p>Organize notes and link GitHub repositories.</p>
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onKeyDown={handleFormKeyDown}
            onSubmit={handleSubmit(
              (values: ProjectFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="form-grid">
              <FormField name="displayName" label="Name" error={errors.displayName?.message} required>
                {(fieldProps) => <input autoFocus={mode === WorkspaceModalMode.Create} {...fieldProps} {...register('displayName')} />}
              </FormField>
              {mode === WorkspaceModalMode.Create ? (
                <FormField name="projectSlug" label="Slug" error={errors.projectSlug?.message} optional>
                  {(fieldProps) => <input placeholder="auto-generated" {...fieldProps} {...register('projectSlug')} />}
                </FormField>
              ) : (
                <FormField name="projectSlug" label="Slug" error={undefined} optional>
                  {(fieldProps) => <input {...fieldProps} value={project?.projectSlug || ''} disabled readOnly />}
                </FormField>
              )}
            </div>

            <FormField name="repositoryIds" label="GitHub repositories" error={errors.repositoryIds?.message} optional>
              {(fieldProps) => (
                hasRepositoryOptions ? (
                  <Controller
                    control={control}
                    name="repositoryIds"
                    render={({ field }) => (
                      <div
                        {...fieldProps}
                        aria-label="GitHub repositories"
                        className="repository-picker"
                      >
                        {workspaceRepositories.map((repository) => {
                          const checked = field.value.includes(repository.id);

                          return (
                            <label className="repository-option" key={repository.id}>
                              <input
                                checked={checked}
                                disabled={mutation.isPending || !githubConnected}
                                name={field.name}
                                type="checkbox"
                                value={repository.id}
                                onBlur={field.onBlur}
                                onChange={() => field.onChange(
                                  checked
                                    ? field.value.filter((repositoryId) => repositoryId !== repository.id)
                                    : [...field.value, repository.id],
                                )}
                              />
                              <span>
                                <strong>{repository.fullName}</strong>
                                <small>{repository.private ? 'Private' : 'Public'}</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  />
                ) : (
                  <input
                    {...fieldProps}
                    value={repositoryPlaceholder}
                    disabled
                    readOnly
                  />
                )
              )}
            </FormField>
            {hasRepositoryOptions ? <p className="meta">{repositoryHint}</p> : null}

            <div className="quick-note-meta-triggers" role="toolbar" aria-label="Add project details">
              <button
                type="button"
                className={`meta-toggle-btn ${isTagsVisible ? 'active' : ''}`}
                onClick={() => setShowTags((v) => !v)}
                aria-expanded={isTagsVisible}
                title="Toggle default tags"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <line x1="2.5" y1="6" x2="13.5" y2="6" />
                  <line x1="2.5" y1="10" x2="13.5" y2="10" />
                  <line x1="6" y1="2.5" x2="4.5" y2="13.5" />
                  <line x1="11.5" y1="2.5" x2="10" y2="13.5" />
                </svg>
                <span>{watchedDefaultTags.length > 0 ? `${watchedDefaultTags.length} default tags` : '+ Default tags'}</span>
              </button>
            </div>

            {isTagsVisible && (
              <FormField name="defaultTags" label="Tags" error={errors.defaultTags?.message} optional>
                {(fieldProps) => (
                  <Controller
                    control={control}
                    name="defaultTags"
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

            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === WorkspaceModalMode.Create ? 'Create project' : 'Save project'} />
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
