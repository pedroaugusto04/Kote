import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { GuidedIntegrationsSection, IntegrationCallbackNotice } from '../../features/integrations/GuidedIntegrationsSection';
import { PageHead } from '../../shared/ui/primitives';

export function IntegrationsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const location = useLocation();
  const callback = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return {
      integration: search.get('integration'),
      status: search.get('status'),
      workspaceSlug: search.get('workspaceSlug'),
    };
  }, [location.search]);

  return (
    <>
      <PageHead
        title="Integracoes"
        subtitle={`Workspace ${workspaceSlug}: conecte provedores por fluxos guiados.`}
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
      />
    </>
  );
}
