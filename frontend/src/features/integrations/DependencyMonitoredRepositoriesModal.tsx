import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { fetchDependencyMonitoredRepositories, saveDependencyMonitoredRepositories } from '../../shared/api/integrations';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { InlineMessage } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import type { DependencyMonitoredRepository } from '../../shared/api/models/dependency-watcher';

const dependencyMonitoredRepositoriesFormSchema = z.object({
  repositories: z.array(z.string()),
});

type DependencyMonitoredRepositoriesFormValues = z.infer<typeof dependencyMonitoredRepositoriesFormSchema>;

function DependencyMonitoredRepositoriesModal({ workspaceSlug, onClose }: { workspaceSlug: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const repositoriesQuery = useQuery({
    queryKey: ['dependency-monitored-repositories', workspaceSlug],
    queryFn: () => fetchDependencyMonitoredRepositories(workspaceSlug),
  });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<DependencyMonitoredRepositoriesFormValues>({
    resolver: zodResolver(dependencyMonitoredRepositoriesFormSchema),
    shouldFocusError: false,
    defaultValues: { repositories: [] },
  });
  const selected = watch('repositories');
  const repositories = repositoriesQuery.data?.repositories || [];
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  useEffect(() => {
    if (repositoriesQuery.data) {
      reset({
        repositories: repositoriesQuery.data.repositories.filter((repo) => repo.monitored).map((repo) => repo.id),
      });
    }
  }, [repositoriesQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: DependencyMonitoredRepositoriesFormValues) => globalLoading.trackPromise(
      saveDependencyMonitoredRepositories(workspaceSlug, values.repositories),
    ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dependency-monitored-repositories', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['project-dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess(`Monitoring ${result.data.monitored} repositories. Dependency import started - processing in background.`);
      closeGuard.resetCloseGuard();
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<DependencyMonitoredRepositoriesFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Failed to save monitored repositories');
    },
  });

  const toggle = (repository: DependencyMonitoredRepository) => {
    setValue('repositories', selected.includes(repository.id)
      ? selected.filter((item) => item !== repository.id)
      : [...selected, repository.id], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="dependency-monitored-repositories-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="card-kicker">Dependency Watcher</div>
              <h2 id="dependency-monitored-repositories-title">Monitored Repositories</h2>
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>

          <p className="meta">Select project-linked repositories to monitor. Saving runs an initial dependency scan.</p>
          {repositoriesQuery.isLoading ? <p className="meta">Loading repositories...</p> : null}
          {repositoriesQuery.isError ? <InlineMessage tone="error">Failed to load repositories</InlineMessage> : null}
          {!repositoriesQuery.isLoading && repositories.length === 0 ? (
            <InlineMessage tone="warning">Link GitHub repositories to projects before selecting monitored repositories.</InlineMessage>
          ) : null}
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values) => saveMutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="repository-picker" data-field="repositories" aria-label="Monitored repository list">
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
                    <small>{repository.projectNames.length > 0 ? repository.projectNames.join(', ') : 'Linked project'}</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
            <div className="integration-card-foot">
              <span className="meta">{selected.length} repositor{selected.length === 1 ? 'y' : 'ies'} selected</span>
              <FormActions disabled={saveMutation.isPending} onCancel={closeGuard.requestClose} submitLabel="Save & Scan" />
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

export { DependencyMonitoredRepositoriesModal };
