import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { createWorkspace } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormField } from '../../shared/forms/fields';
import { slugifyInput } from '../../shared/forms/normalizers';
import { notifySuccess } from '../../shared/ui/notifications';
import { BrandMark } from '../../shared/ui/brand-mark';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import { workspaceFormSchema, type WorkspaceFormValues } from './setup-page.forms';

function StepState({ complete, pendingLabel, doneLabel }: { complete: boolean; pendingLabel: string; doneLabel: string }) {
  return <span className={`setup-step-state ${complete ? 'done' : 'pending'}`}>{complete ? doneLabel : pendingLabel}</span>;
}

export function SetupPage({ dashboard, refetchDashboard }: { dashboard: Dashboard; refetchDashboard: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createdWorkspaceSlug, setCreatedWorkspaceSlug] = useState('');
  const activeWorkspace = dashboard.workspaces[0] || null;
  const workspaceReady = Boolean(activeWorkspace || createdWorkspaceSlug);

  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setValue,
    watch,
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    shouldFocusError: false,
    defaultValues: { displayName: '', workspaceSlug: '' },
  });
  const displayName = watch('displayName');

  useEffect(() => {
    if (slugTouched) return;
    setValue('workspaceSlug', slugifyInput(displayName));
  }, [displayName, setValue, slugTouched]);

  // Auto-focus display name input on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = formRef.current?.querySelector('input[name="displayName"]') as HTMLInputElement | null;
      input?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const createWorkspaceMutation = useMutation({
    mutationFn: (values: WorkspaceFormValues) => globalLoading.trackPromise(createWorkspace(values)),
    onSuccess: (result) => {
      setCreatedWorkspaceSlug(result.workspace.workspaceSlug);
      notifySuccess('Workspace created successfully.');
      queryClient.setQueryData<Dashboard>(['dashboard'], (current) => current
        ? {
          ...current,
          workspaces: [result.workspace],
          projects: current.projects.some((project) => project.projectSlug === result.initialProject.projectSlug)
            ? current.projects
            : [{ ...result.initialProject, favorite: false }, ...current.projects],
        }
        : current);
      navigate(withFrontendBasePath(routes.home));
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<WorkspaceFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Could not create the workspace.');
    },
  });

  return (
    <main className="setup-layout">
      <div className="setup-shell">
        <section className="setup-hero">
          <Link className="brand auth-brand" to={routes.home} aria-label="Ir para Home">
            <BrandMark />
            <div>
              <strong>Kote</strong>
              <span>workspace setup</span>
            </div>
          </Link>
          <div style={{ marginTop: '12px' }}>
            <PageHead
              title="Create your workspace"
              subtitle="Name your workspace to get started. You'll be able to connect GitHub, WhatsApp, and other integrations from the dashboard."
            />
          </div>
        </section>

        <section className="setup-grid">
          <Panel className="setup-step-card">
            <div className="setup-step-head">
              <div>
                <h2>Create workspace</h2>
              </div>
              <StepState complete={workspaceReady} pendingLabel="required" doneLabel="done" />
            </div>
            {activeWorkspace ? (
              <div className="setup-step-body">
                <p>Current workspace: <strong>{activeWorkspace.displayName}</strong> ({activeWorkspace.workspaceSlug})</p>
              </div>
            ) : (
              <form
                className="auth-form setup-form"
                ref={formRef}
                noValidate
                onSubmit={handleSubmit(
                  (values) => createWorkspaceMutation.mutate(values),
                  (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
                )}
              >
                <FormField name="displayName" label="Workspace name" error={errors.displayName?.message} required>
                  {(fieldProps) => <input {...fieldProps} {...register('displayName')} placeholder={UI_MESSAGES.MY_WORKSPACE} />}
                </FormField>
                <FormField name="workspaceSlug" label="Workspace slug" error={errors.workspaceSlug?.message} required>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      {...register('workspaceSlug', {
                        onChange: () => setSlugTouched(true),
                      })}
                    />
                  )}
                </FormField>
                <button className="icon-button auth-submit setup-submit" disabled={createWorkspaceMutation.isPending} type="submit">
                  Create workspace
                </button>
              </form>
            )}
          </Panel>
        </section>

        {workspaceReady ? (
          <section className="setup-actions">
            <a className="icon-button" href={withFrontendBasePath(routes.home)}>
              Go to dashboard
            </a>
            {!activeWorkspace ? <span className="meta">Syncing workspace...</span> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
