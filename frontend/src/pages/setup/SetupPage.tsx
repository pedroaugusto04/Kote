import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';

import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { GuidedIntegrationsSection, IntegrationCallbackNotice } from '../../features/integrations/GuidedIntegrationsSection';
import { createWorkspace, getErrorMessage } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { UserIntegration } from '../../shared/api/models/integration';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormField } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { workspaceFormSchema, type WorkspaceFormValues } from './setup-page.forms';

function slugify(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function StepState({ complete, pendingLabel, doneLabel }: { complete: boolean; pendingLabel: string; doneLabel: string }) {
  return <span className={`setup-step-state ${complete ? 'done' : 'pending'}`}>{complete ? doneLabel : pendingLabel}</span>;
}

export function SetupPage({ dashboard, refetchDashboard }: { dashboard: Dashboard; refetchDashboard: () => Promise<unknown> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createdWorkspaceSlug, setCreatedWorkspaceSlug] = useState('');
  const [continueError, setContinueError] = useState('');
  const [continuePending, setContinuePending] = useState(false);
  const [githubIntegrations, setGithubIntegrations] = useState<UserIntegration[]>([]);
  const [chatIntegrations, setChatIntegrations] = useState<UserIntegration[]>([]);
  const activeWorkspace = dashboard.workspaces[0] || null;
  const effectiveWorkspaceSlug = createdWorkspaceSlug || activeWorkspace?.workspaceSlug || '';
  const githubCallbackStatus = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return {
      integration: search.get('integration'),
      status: search.get('status'),
      workspaceSlug: search.get('workspaceSlug'),
    };
  }, [location.search]);

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
    setValue('workspaceSlug', slugify(displayName));
  }, [displayName, setValue, slugTouched]);

  const createWorkspaceMutation = useMutation({
    mutationFn: (values: WorkspaceFormValues) => createWorkspace(values),
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
  const githubReposSelected = (activeWorkspace?.githubRepos.length || 0) > 0;
  const chatConnected = chatIntegrations.some((integration) => (
    (integration.provider === 'whatsapp' || integration.provider === 'telegram') && integration.status === 'connected'
  ));
  const workspaceReady = Boolean(activeWorkspace || createdWorkspaceSlug);
  const callbackMatchesWorkspace = Boolean(githubCallbackStatus.workspaceSlug && githubCallbackStatus.workspaceSlug === effectiveWorkspaceSlug);

  async function enterDashboard() {
    setContinueError('');
    setContinuePending(true);
    if (activeWorkspace || createdWorkspaceSlug) {
      navigate(routes.home);
      setContinuePending(false);
      return;
    }

    try {
      const result = await refetchDashboard();
      const refreshedDashboard = result && typeof result === 'object' && 'data' in result ? result.data as Dashboard | undefined : undefined;
      if (refreshedDashboard?.workspaces[0]) {
        navigate(routes.home);
        return;
      }
      setContinueError('Ainda estou sincronizando o workspace. Tente novamente em alguns segundos.');
    } catch (error) {
      setContinueError(getErrorMessage(error, 'Nao foi possivel abrir o dashboard agora.'));
    } finally {
      setContinuePending(false);
    }
  }

  return (
    <main className="setup-layout">
      <section className="setup-hero">
        <div className="brand auth-brand">
          <div className="brand-mark">KV</div> 
          <div>
            <strong>Knowledge Vault</strong>
            <span>workspace setup wizard</span>
          </div>
        </div>
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
              <FormField name="displayName" label="Nome do workspace" error={errors.displayName?.message}>
                {(fieldProps) => <input {...fieldProps} {...register('displayName')} />}
              </FormField>
              <FormField name="workspaceSlug" label="Slug do workspace" error={errors.workspaceSlug?.message}>
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
          <button className="icon-button" disabled={continuePending} type="button" onClick={() => void enterDashboard()}>
            Ir para o dashboard
          </button>
          {!activeWorkspace ? <span className="meta">Sincronizando workspace...</span> : null}
          {continueError ? <InlineMessage tone="error">{continueError}</InlineMessage> : null}
        </section>
      ) : null}
    </main>
  );
}
