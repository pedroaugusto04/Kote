import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { GuidedIntegrationsSection, IntegrationCallbackNotice, useIntegrationCallback } from '../../features/integrations/GuidedIntegrationsSection';
import { WebhookSubscriptionsCard } from '../../features/integrations/WebhookSubscriptionsCard';
import { PageHead } from '../../shared/ui/primitives';

export function IntegrationsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const callback = useIntegrationCallback();

  return (
    <>
      <PageHead
        title="Integrations"
        subtitle=""
      />
      {callback.integration === 'github-app'
        && callback.workspaceSlug === workspaceSlug
        && (callback.status === 'connected' || callback.status === 'error')
        ? <IntegrationCallbackNotice status={callback.status} />
        : null}
      <GuidedIntegrationsSection
        workspaceSlug={workspaceSlug}
        returnToPath={withFrontendBasePath(routes.integrations)}
        defaultOpenGithubRepositories={callback.integration === 'github-app' && callback.status === 'connected' && callback.workspaceSlug === workspaceSlug}
      >
        <WebhookSubscriptionsCard workspaceSlug={workspaceSlug} />
      </GuidedIntegrationsSection>
    </>
  );
}
