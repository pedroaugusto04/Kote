import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { fetchProjects, importDependenciesFromGithub } from '../../shared/api/client';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { InlineMessage } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import type { Project } from '../../shared/api/models/project';
import { z } from 'zod';

const dependencyImportFormSchema = z.object({
  projectIds: z.array(z.string()).min(1, 'Select at least one project'),
});

type DependencyImportFormValues = z.infer<typeof dependencyImportFormSchema>;

function DependencyImportModal({ workspaceSlug, onClose }: { workspaceSlug: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const projectsQuery = useQuery({ queryKey: ['projects', workspaceSlug], queryFn: () => fetchProjects({ page: 1, pageSize: 100, selectedSlug: workspaceSlug }) });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<DependencyImportFormValues>({
    resolver: zodResolver(dependencyImportFormSchema),
    shouldFocusError: false,
    defaultValues: { projectIds: [] },
  });
  const selected = watch('projectIds');
  const projects = projectsQuery.data?.projects || [];
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  const importMutation = useMutation({
    mutationFn: (values: DependencyImportFormValues) => globalLoading.trackPromise(importDependenciesFromGithub(
      workspaceSlug,
      values.projectIds,
    )),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess(`Imported ${result.data.imported} dependencies from ${result.data.repositories} repositories`);
      closeGuard.resetCloseGuard();
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<DependencyImportFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Failed to import dependencies');
    },
  });

  const toggle = (project: Project) => {
    if (!project.id) return;
    setValue('projectIds', selected.includes(project.id)
      ? selected.filter((item) => item !== project.id)
      : [...selected, project.id], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="dependency-import-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="card-kicker">Dependency Watcher</div>
              <h2 id="dependency-import-title">Import Dependencies</h2>
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>

          {projectsQuery.isLoading ? <p className="meta">Loading projects...</p> : null}
          {projectsQuery.isError ? <InlineMessage tone="error">Failed to load projects</InlineMessage> : null}
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values) => importMutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="repository-picker" data-field="projectIds" aria-label="Project list">
              {projects.map((project) => (
                <label className="repository-option" key={project.id}>
                  <input
                    checked={project.id ? selected.includes(project.id) : false}
                    disabled={importMutation.isPending}
                    name="projectIds"
                    type="checkbox"
                    value={project.id}
                    onChange={() => toggle(project)}
                  />
                  <span>
                    <strong>{project.displayName}</strong>
                    <small>{project.repositories.length} repositories</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.projectIds?.message ? <p className="form-error" role="alert">{errors.projectIds.message}</p> : null}
            <div className="integration-card-foot">
              <span className="meta">{selected.length} project{selected.length !== 1 ? 's' : ''} selected</span>
              <FormActions disabled={importMutation.isPending} onCancel={closeGuard.requestClose} submitLabel="Import Dependencies" />
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

export { DependencyImportModal };
