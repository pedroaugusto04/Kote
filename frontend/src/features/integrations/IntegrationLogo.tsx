import { INTEGRATION_LOGOS, IntegrationProvider } from './integrations.constants';
import type { UserIntegration } from '../../shared/api/models/integration';
import { CDNImage } from '../../shared/ui/CDNImage';

function integrationId(integration: UserIntegration) {
  return integration.provider;
}

export function IntegrationLogo({ integration }: { integration: UserIntegration }) {
  if (integration.provider === IntegrationProvider.PushNotifications) {
    return (
      <div
        className="integration-logo"
        style={{
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface-6)',
          padding: '9px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="var(--cyan)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
    );
  }
  const logo = INTEGRATION_LOGOS[integrationId(integration)];
  if (!logo) return <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;
  const logoClassName = integration.provider === IntegrationProvider.GithubApp
    ? 'integration-logo integration-logo-github-app'
    : 'integration-logo';

  const fallback = <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;

  return (
    <CDNImage
      alt={`${logo.label} logo`}
      className={logoClassName}
      src={logo.src}
      fallback={fallback}
    />
  );
}
