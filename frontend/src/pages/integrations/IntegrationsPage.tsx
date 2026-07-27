import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { GuidedIntegrationsSection, IntegrationCallbackNotice, useIntegrationCallback } from '../../features/integrations/GuidedIntegrationsSection';
import { WebhookSubscriptionsCard } from '../../features/integrations/WebhookSubscriptionsCard';
import { PageHead } from '../../shared/ui/primitives';
import { IntegrationProvider } from '../../features/integrations/integrations.constants';
import { StoredIntegrationStatus } from '../../shared/api/enums';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';

export function IntegrationsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const callback = useIntegrationCallback();

  return (
    <>
      <PageHead
        title={UI_MESSAGES.INTEGRATIONS}
        subtitle=""
      />
      {callback.integration === IntegrationProvider.GithubApp
        && callback.workspaceSlug === workspaceSlug
        && callback.status === StoredIntegrationStatus.Error
        ? <IntegrationCallbackNotice status={StoredIntegrationStatus.Error} />
        : null}
      <GuidedIntegrationsSection
        workspaceSlug={workspaceSlug}
        returnToPath={withFrontendBasePath(routes.integrations)}
        defaultOpenGithubRepositories={callback.integration === IntegrationProvider.GithubApp && callback.status === StoredIntegrationStatus.Connected && callback.workspaceSlug === workspaceSlug}
      >
        <WebhookSubscriptionsCard workspaceSlug={workspaceSlug} />
      </GuidedIntegrationsSection>
    </>
  );
}
