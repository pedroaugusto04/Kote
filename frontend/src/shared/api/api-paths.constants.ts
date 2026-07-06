export const API_PATHS = {
  // Auth paths
  AUTH_LOGIN: '/api/auth/login',
  AUTH_SIGNUP: '/api/auth/signup',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_ME: '/api/auth/me',
  AUTH_AVATAR: '/api/auth/avatar',
  AUTH_GOOGLE_START: '/api/auth/google/start',
  AUTH_REFRESH: '/api/auth/refresh',
  AUTH_CONNECTION_TOKEN: '/api/auth/connection-token',
  AUTH_VSCODE_INSTALLED: '/api/auth/vscode-installed',

  // Projects paths
  PROJECTS: '/api/projects',
  PROJECTS_TIMELINE: '/api/projects/timeline',

  // Notes paths
  NOTES: '/api/notes',

  // Integrations paths
  INTEGRATIONS: '/api/integrations',
  INTEGRATIONS_CONNECT: '/api/integrations/{provider}/connect',
  INTEGRATIONS_SESSIONS: '/api/integrations/{provider}/sessions/{sessionId}',
  INTEGRATIONS_TEST: '/api/integrations/{provider}/test',
  INTEGRATIONS_GITHUB_REPOSITORIES: '/api/integrations/github-app/repositories',
  INTEGRATIONS_GITHUB_BACKFILL: '/api/integrations/github-app/backfill',
  INTEGRATIONS_GITHUB_BACKFILL_STATUS: '/api/integrations/github-app/backfill/status',
  INTEGRATIONS_GITHUB_BACKFILL_CANCEL: '/api/integrations/github-app/backfill/cancel',

  // Dashboard paths
  DASHBOARD: '/api/dashboard',
  PRODUCTIVITY_INSIGHTS: '/api/productivity/insights',

  // Ask paths
  ASK: '/api/ask',

  // Workspaces paths
  WORKSPACES: '/api/workspaces',

  // Webhook subscriptions paths
  WEBHOOK_SUBSCRIPTIONS: '/api/webhook-subscriptions',
  WEBHOOK_SUBSCRIPTIONS_TRIGGERS: '/api/webhook-subscriptions/triggers',

  // Push subscriptions paths
  PUSH_SUBSCRIPTIONS: '/api/push-subscriptions',
  PUSH_SUBSCRIPTIONS_PUBLIC_KEY: '/api/push-subscriptions/public-key',

  // Subscription paths
  SUBSCRIPTION_PLANS: '/api/subscription/plans',
  SUBSCRIPTION_COUNTRY: '/api/subscription/country',
  SUBSCRIPTION_STRIPE_CONFIG: '/api/subscription/stripe/config',
  SUBSCRIPTION_STATUS: '/api/subscription/status',
  SUBSCRIPTION_STATUS_STREAM: '/api/subscription/status/stream',
  SUBSCRIPTION: '/api/subscription',

  // Application paths
  APPLICATION_ACCESS: '/api/application/access',
} as const;

export type ApiPathKey = keyof typeof API_PATHS;

export function buildApiPath(template: string, params: Record<string, string>): string {
  let path = template;
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  });
  return path;
}
