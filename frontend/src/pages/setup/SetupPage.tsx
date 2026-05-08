import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { GuidedIntegrationsSection, IntegrationCallbackNotice, useIntegrationCallback } from '../../features/integrations/GuidedIntegrationsSection';
import { createWorkspace } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { UserIntegration } from '../../shared/api/models/integration';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormField } from '../../shared/forms/fields';
import { slugifyInput } from '../../shared/forms/normalizers';
import { notifySuccess } from '../../shared/ui/notifications';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import { workspaceFormSchema, type WorkspaceFormValues } from './setup-page.forms';

function StepState({ complete, pendingLabel, doneLabel }: { complete: boolean; pendingLabel: string; doneLabel: string }) {
  return <span className={`setup-step-state ${complete ? 'done' : 'pending'}`}>{complete ? doneLabel : pendingLabel}</span>;
}

export function SetupPage({ dashboard, refetchDashboard }: { dashboard: Dashboard; refetchDashboard: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createdWorkspaceSlug, setCreatedWorkspaceSlug] = useState('');
  const [githubIntegrations, setGithubIntegrations] = useState<UserIntegration[]>([]);
  const [chatIntegrations, setChatIntegrations] = useState<UserIntegration[]>([]);
  const activeWorkspace = dashboard.workspaces[0] || null;
  const effectiveWorkspaceSlug = createdWorkspaceSlug || activeWorkspace?.workspaceSlug || '';
  const githubCallbackStatus = useIntegrationCallback();

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

  const createWorkspaceMutation = useMutation({
    mutationFn: (values: WorkspaceFormValues) => globalLoading.trackPromise(createWorkspace(values)),
    onSuccess: (result) => {
      setCreatedWorkspaceSlug(result.workspace.workspaceSlug);
      notifySuccess('Workspace criado com sucesso.');
      queryClient.setQueryData<Dashboard>(['dashboard'], (current) => current
        ? {
            ...current,
            workspaces: [result.workspace],
            projects: current.projects.some((project) => project.projectSlug === result.initialProject.projectSlug)
              ? current.projects
              : [result.initialProject, ...current.projects],
          }
        : current);
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<WorkspaceFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Nao foi possivel criar o workspace.');
    },
  });

  const githubConnected = githubIntegrations.some((integration) => integration.provider === 'github-app' && integration.status === 'connected');
  const githubReposSelected = dashboard.projects.some((p) => p.repositories.length > 0);
  const chatConnected = chatIntegrations.some((integration) => (
    (integration.provider === 'whatsapp' || integration.provider === 'telegram') && integration.status === 'connected'
  ));
  const workspaceReady = Boolean(activeWorkspace || createdWorkspaceSlug);
  const callbackMatchesWorkspace = Boolean(githubCallbackStatus.workspaceSlug && githubCallbackStatus.workspaceSlug === effectiveWorkspaceSlug);

  return (
    <main className="setup-layout">
      <section className="setup-hero">
        <Link className="brand auth-brand" to={routes.home} aria-label="Ir para Home">
          <div className="brand-mark">KV</div> 
          <div>
            <strong>Knowledge Vault</strong>
            <span>workspace setup wizard</span>
          </div>
        </Link>
        <PageHead
          title="Configurar workspace"
          subtitle=""
        />
      </section>

      <section className="setup-grid">
        <Panel className="setup-step-card">
          <div className="setup-step-head">
            <div>
              <div className="card-kicker">Passo 1</div>
              <h2>Criar workspace</h2>
            </div>
            <StepState complete={workspaceReady} pendingLabel="obrigatorio" doneLabel="concluido" />
          </div>
          {activeWorkspace ? (
            <div className="setup-step-body">
              <p>Workspace atual: <strong>{activeWorkspace.displayName}</strong> ({activeWorkspace.workspaceSlug})</p>
            </div>
          ) : (
            <form
              className="auth-form"
              ref={formRef}
              noValidate
              onSubmit={handleSubmit(
                (values) => createWorkspaceMutation.mutate(values),
                (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
              )}
            >
              <FormField name="displayName" label="Nome do workspace" error={errors.displayName?.message} required>
                {(fieldProps) => <input {...fieldProps} {...register('displayName')} />}
              </FormField>
              <FormField name="workspaceSlug" label="Slug do workspace" error={errors.workspaceSlug?.message} required>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    {...register('workspaceSlug', {
                      onChange: () => setSlugTouched(true),
                    })}
                  />
                )}
              </FormField>
              <button className="icon-button auth-submit" disabled={createWorkspaceMutation.isPending} type="submit">
                Criar workspace
              </button>
            </form>
          )}
        </Panel>

        <Panel className="setup-step-card">
          <div className="setup-step-head">
            <div>
              <div className="card-kicker">Passo 2</div>
              <h2>Conectar GitHub</h2>
            </div>
            <StepState complete={githubConnected && githubReposSelected} pendingLabel="opcional" doneLabel="concluido" />
          </div>
          {workspaceReady ? (
            <>
              {githubCallbackStatus.integration === 'github-app'
                && callbackMatchesWorkspace
                && (githubCallbackStatus.status === 'connected' || githubCallbackStatus.status === 'error')
                ? <IntegrationCallbackNotice status={githubCallbackStatus.status} />
                : null}
              <GuidedIntegrationsSection
                workspaceSlug={effectiveWorkspaceSlug}
                returnToPath={withFrontendBasePath(routes.setup)}
                providers={['github-app']}
                defaultOpenGithubRepositories={githubCallbackStatus.integration === 'github-app' && githubCallbackStatus.status === 'connected' && callbackMatchesWorkspace}
                onGithubRepositoriesSaved={async () => {
                  await refetchDashboard();
                }}
                onLoaded={setGithubIntegrations}
              />
            </>
          ) : (
            <p className="meta">Crie o workspace antes de iniciar a conexao com o GitHub.</p>
          )}
        </Panel>

        <Panel className="setup-step-card">
          <div className="setup-step-head">
            <div>
              <div className="card-kicker">Passo 3</div>
              <h2>Conectar WhatsApp ou Telegram</h2>
            </div>
            <StepState complete={chatConnected} pendingLabel="opcional" doneLabel="concluido" />
          </div>
          {workspaceReady ? (
            <GuidedIntegrationsSection
              workspaceSlug={effectiveWorkspaceSlug}
              returnToPath={withFrontendBasePath(routes.setup)}
              providers={['whatsapp', 'telegram']}
              onLoaded={setChatIntegrations}
            />
          ) : (
            <p className="meta">Crie o workspace antes de iniciar os fluxos de mensageria.</p>
          )}
        </Panel>
      </section>

      {workspaceReady ? (
        <section className="setup-actions">
          <a className="icon-button" href={withFrontendBasePath(routes.home)}>
            Ir para o dashboard
          </a>
          {!activeWorkspace ? <span className="meta">Sincronizando workspace...</span> : null}
        </section>
      ) : null}
    </main>
  );
}
