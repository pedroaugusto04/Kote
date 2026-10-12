import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import {
  INTEGRATION_MESSAGES,
  IntegrationProvider,
} from './integrations.constants';
import {
  fetchGithubRepositories,
  getErrorMessage,
  saveGithubRepositories,
} from '../../shared/api/client';
import {
  githubRepositoriesFormSchema,
  type GithubRepositoriesFormValues,
} from './guided-integrations.forms';
import type { GithubIntegrationRepository } from '../../shared/api/models/integration';
import {
  applyBackendFieldErrors,
  fieldNamesFromErrors,
  focusFirstFormError,
  notifyGeneralFormError,
} from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import {
  discardChangesConfirmationCopy,
  useModalCloseGuard,
} from '../../shared/ui/use-modal-close-guard';
import { InlineMessage } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';

export interface GithubRepositoriesModalProps {
  workspaceSlug: string;
  onClose: () => void;
  onSaved?: (repositories: string[]) => void;
}

export function GithubRepositoriesModal({ workspaceSlug, onClose, onSaved }: GithubRepositoriesModalProps) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const repositoriesQuery = useQuery({ queryKey: ['github-repositories', workspaceSlug], queryFn: () => fetchGithubRepositories(workspaceSlug) });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<GithubRepositoriesFormValues>({
    resolver: zodResolver(githubRepositoriesFormSchema),
    shouldFocusError: false,
    defaultValues: { repositories: [] },
  });
  const selected = watch('repositories');
  const repositories = repositoriesQuery.data?.repositories || [];
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  useEffect(() => {
    if (repositoriesQuery.data) {
      reset({
        repositories: repositoriesQuery.data.repositories.filter((repo) => repo.selected).map((repo) => repo.id),
      });
    }
  }, [repositoriesQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: GithubRepositoriesFormValues) => globalLoading.trackPromise(saveGithubRepositories(
      workspaceSlug,
      repositories.filter((repo) => values.repositories.includes(repo.id)).map((repo) => ({ id: repo.id, fullName: repo.fullName })),
    )),
    onSuccess: (_result, values) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess(INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SUCCESS);
      closeGuard.resetCloseGuard();
      const savedRepositories = repositories
        .filter((repo) => values.repositories.includes(repo.id))
        .map((repo) => repo.fullName);
      onSaved?.(savedRepositories);
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<GithubRepositoriesFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.ERROR_SAVE);
    },
  });

  const toggle = (repository: GithubIntegrationRepository) => {
    setValue('repositories', selected.includes(repository.id)
      ? selected.filter((item) => item !== repository.id)
      : [...selected, repository.id], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="github-repositories-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="card-kicker">{IntegrationProvider.GithubApp}</div>
              <h2 id="github-repositories-title">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.TITLE}</h2>
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>

          {repositoriesQuery.isLoading ? <p className="meta">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.LOADING}</p> : null}
          {repositoriesQuery.isError ? <InlineMessage tone="error">{getErrorMessage(repositoriesQuery.error, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.ERROR)}</InlineMessage> : null}
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values) => saveMutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="repository-picker" data-field="repositories" aria-label={INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.REPOSITORY_LIST_ARIA}>
              {repositories.map((repository) => (
                <label className="repository-option" key={repository.id}>
                  <input
                    checked={selected.includes(repository.id)}
                    disabled={saveMutation.isPending}
                    name="repositories"
                    type="checkbox"
                    value={repository.id}
                    onChange={() => toggle(repository)}
                  />
                  <span>
                    <strong>{repository.fullName}</strong>
                    <small>{repository.private ? UI_MESSAGES.PRIVATE : UI_MESSAGES.PUBLIC}</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
            <div className="integration-card-foot">
              <span className="meta">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SELECTED.replace('{count}', String(selected.length))}</span>
              <FormActions disabled={saveMutation.isPending} onCancel={closeGuard.requestClose} submitLabel={INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SAVE} />
            </div>
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
