import { Injectable } from '@nestjs/common';

import { AiProvider, IntegrationProvider, IntegrationSetupStatus } from '../../../contracts/enums.js';
import type { Project } from '../../../domain/projects.js';
import type { Workspace } from '../../../domain/workspaces.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { PushSubscriptionRepository } from '../../ports/push/push-subscription.repository.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { absoluteUrl, configuredEnv, link, missingEnv, secretConfigured, statusFromFlags, workspaceRepos } from '../../utils/integration/integration-status.utils.js';

export type IntegrationStatusValue = IntegrationSetupStatus;

export type IntegrationLink = {
  label: string;
  url: string;
  external: boolean;
};

export type IntegrationStatus = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatusValue;
  requiredEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  links: IntegrationLink[];
  checklist: string[];
  warnings: string[];
};

export function buildIntegrationStatuses(input: {
  environment: RuntimeEnvironment;
  workspaces: Workspace[];
  projects: Project[];
  hasPushSubscription?: boolean;
}): { ok: true; workspaceSlug: string; integrations: IntegrationStatus[] } {
  const { environment, workspaces, projects } = input;
  const hasPushSubscription = Boolean(input.hasPushSubscription);
  const workspace = workspaces[0];
  const workspaceSlug = workspace?.workspaceSlug || 'default';
  const repos = workspaceRepos(workspace, projects);
  const workspaceWhatsappChat = Boolean(workspace?.whatsappChatJid);
  const workspaceTelegramChat = Boolean(workspace?.telegramChatId);

  const githubEnv = {
    KB_GITHUB_APP_INSTALL_URL: Boolean(environment.githubAppInstallUrl),
    KB_GITHUB_APP_WEBHOOK_SECRET: secretConfigured(environment.githubWebhookSecret),
    KB_GITHUB_APP_ID: Boolean(environment.githubAppId),
    KB_GITHUB_APP_PRIVATE_KEY: secretConfigured(environment.githubAppPrivateKey),
  };

  const apiBaseUrl = environment.apiPublicBaseUrl || environment.publicBaseUrl;
  const webhookEnv = {
    KB_API_PUBLIC_BASE_URL: Boolean(apiBaseUrl),
    KB_GITHUB_WEBHOOK_PATH: Boolean(environment.githubPushWebhookPath),
    KB_INGEST_WEBHOOK_PATH: Boolean(environment.ingestWebhookPath),
    KB_WPP_WEBHOOK_PATH: Boolean(environment.whatsappWebhookPath),
    KB_QUERY_WEBHOOK_PATH: Boolean(environment.queryWebhookPath),
  };

  const evolutionTransportConfigured = Boolean(
    environment.evolutionApiUrl &&
    environment.evolutionInstanceName &&
    environment.evolutionApiKey &&
    environment.evolutionApiPublicUrl,
  );
  const whatsappEnv = {
    EVOLUTION_API_URL: Boolean(environment.evolutionApiUrl),
    EVOLUTION_INSTANCE_NAME: Boolean(environment.evolutionInstanceName),
    EVOLUTION_API_KEY: secretConfigured(environment.evolutionApiKey),
    EVOLUTION_API_PUBLIC_URL: Boolean(environment.evolutionApiPublicUrl),
  };

  const telegramEnv = {
    KB_TELEGRAM_BOT_TOKEN: secretConfigured(environment.telegramBotToken),
    KB_TELEGRAM_CHAT_ID: Boolean(environment.telegramChatId),
  };
  const telegramChat = Boolean(environment.telegramChatId) || workspaceTelegramChat;

  const dependencyWatcherAiActive = environment.dependencyWatcherAiProvider !== AiProvider.None;
  const dependencyWatcherEnv = {
    KB_DEPENDENCY_WATCHER_CRON: Boolean(environment.dependencyWatcherCron),
    KB_DEPENDENCY_WATCHER_CHECK_INTERVAL_HOURS: Boolean(environment.dependencyWatcherCheckIntervalHours),
    KB_DEPENDENCY_WATCHER_AI_PROVIDER: dependencyWatcherAiActive,
    KB_DEPENDENCY_WATCHER_AI_BASE_URL: dependencyWatcherAiActive ? Boolean(environment.dependencyWatcherAiBaseUrl) : true,
    KB_DEPENDENCY_WATCHER_AI_MODEL: dependencyWatcherAiActive ? Boolean(environment.dependencyWatcherAiModel) : true,
    KB_DEPENDENCY_WATCHER_AI_API_KEY: dependencyWatcherAiActive ? secretConfigured(environment.dependencyWatcherAiApiKey) : true,
  };

  return {
    ok: true,
    workspaceSlug,
    integrations: [
      createIntegration({
        id: IntegrationProvider.GithubApp,
        name: 'GitHub App',
        description: 'App installation, signed webhook, and installation token for push reviews.',
        env: githubEnv,
        flags: [...Object.values(githubEnv), repos.length > 0],
        links: environment.githubAppInstallUrl ? [link('Instalar GitHub App', environment.githubAppInstallUrl)] : [],
        checklist: [
          'Install the GitHub App in the workspace repositories.',
          'Configure the app webhook to the GitHub push endpoint.',
          'Select workspace repositories after the connection.',
        ],
        warnings: [
          !environment.githubWebhookSecret ? 'GitHub webhook secret is not configured.' : '',
          !environment.githubAppId || !environment.githubAppPrivateKey ? 'GitHub App credentials are missing for installation token generation.' : '',
          repos.length === 0 ? 'Workspace has no linked repository.' : '',
        ],
      }),
      createIntegration({
        id: 'webhooks',
        name: 'Webhooks',
        description: 'Public URLs used by n8n, GitHub, WhatsApp, and query flows.',
        env: webhookEnv,
        links: [
          link('GitHub push webhook', absoluteUrl(apiBaseUrl, environment.githubPushWebhookPath), Boolean(apiBaseUrl)),
          link('Ingest webhook', absoluteUrl(apiBaseUrl, environment.ingestWebhookPath), Boolean(apiBaseUrl)),
          link('WhatsApp webhook', absoluteUrl(apiBaseUrl, environment.whatsappWebhookPath), Boolean(apiBaseUrl)),
          link('Query webhook', absoluteUrl(apiBaseUrl, environment.queryWebhookPath), Boolean(apiBaseUrl)),
        ],
        checklist: [
          'Publish the API behind a stable HTTPS URL.',
          'Point workflows and adapters to the displayed paths.',
          'Use the same base URL in external providers.',
        ],
        warnings: !apiBaseUrl ? ['KB_API_PUBLIC_BASE_URL is missing: showing relative paths instead of absolute URLs.'] : [],
      }),
      createIntegration({
        id: IntegrationProvider.Whatsapp,
        name: 'WhatsApp',
        description: 'Global Evolution API transport with a workspace-linked chat to capture notes for the correct user.',
        env: whatsappEnv,
        flags: [evolutionTransportConfigured, workspaceWhatsappChat],
        links: [
          environment.evolutionApiPublicUrl ? link('Evolution API', environment.evolutionApiPublicUrl) : null,
        ].filter(Boolean) as IntegrationLink[],
        checklist: [
          'Configure the server global Evolution API.',
          'Connect the workspace conversation through the guided flow to persist the JID.',
          'Configure the provider webhook for the WhatsApp path.',
        ],
        warnings: [
          !evolutionTransportConfigured ? 'Evolution API is incomplete: URL, instance name, API key, or public URL is missing.' : '',
          !workspaceWhatsappChat ? 'No WhatsApp chat is connected for this workspace.' : '',
        ],
      }),
      createIntegration({
        id: IntegrationProvider.Telegram,
        name: 'Telegram',
        description: 'Bot and chat used for ingest notifications, reviews, and operational failures.',
        env: telegramEnv,
        flags: [telegramEnv.KB_TELEGRAM_BOT_TOKEN, telegramChat],
        checklist: [
          'Create or reuse a Telegram bot.',
          'Add the bot to the operational chat.',
          'Configure the global or workspace chat ID.',
        ],
        warnings: [
          !environment.telegramBotToken ? 'Telegram bot token is missing.' : '',
          !telegramChat ? 'Telegram chat ID is missing both in env and workspace.' : '',
        ],
      }),
      createAiIntegration({
        id: IntegrationProvider.AiReview,
        name: 'Review AI',
        description: 'Server-managed provider and model for code reviews.',
        envPrefix: 'KB_REVIEW_AI',
        provider: environment.reviewAiProvider,
        baseUrl: environment.reviewAiBaseUrl,
        model: environment.reviewAiModel,
        apiKey: environment.reviewAiApiKey,
        checklist: [
          'Choose a provider other than none when AI review is enabled.',
          'Define the review model and base URL.',
          'Configure the corresponding API key.',
        ],
      }),
      createAiIntegration({
        id: IntegrationProvider.AiConversation,
        name: 'Conversation AI',
        description: 'Server-managed provider and model for conversation extraction.',
        envPrefix: 'KB_CONVERSATION_AI',
        provider: environment.conversationAiProvider,
        baseUrl: environment.conversationAiBaseUrl,
        model: environment.conversationAiModel,
        apiKey: environment.conversationAiApiKey,
        checklist: [
          'Choose a provider other than none when conversation AI is enabled.',
          'Define the conversation model and base URL.',
          'Configure the corresponding API key.',
        ],
      }),
      createAiIntegration({
        id: IntegrationProvider.ProjectBriefAi,
        name: 'Project Brief AI',
        description: 'Server-managed provider and model for manual project brief generation.',
        envPrefix: 'KB_PROJECT_BRIEF_AI',
        provider: environment.projectBriefAiProvider,
        baseUrl: environment.projectBriefAiBaseUrl,
        model: environment.projectBriefAiModel,
        apiKey: environment.projectBriefAiApiKey,
        checklist: [
          'Choose a provider other than none when project brief AI is enabled.',
          'Define the project brief model and base URL, or inherit Conversation AI settings.',
          'Configure the corresponding API key.',
        ],
      }),
      createAiIntegration({
        id: IntegrationProvider.FileNotesSummaryAi,
        name: 'File Notes Summary AI',
        description: 'Server-managed provider and model for AI-powered file notes summary in VS Code.',
        envPrefix: 'KB_FILE_NOTES_SUMMARY_AI',
        provider: environment.fileNotesSummaryAiProvider,
        baseUrl: environment.fileNotesSummaryAiBaseUrl,
        model: environment.fileNotesSummaryAiModel,
        apiKey: environment.fileNotesSummaryAiApiKey,
        checklist: [
          'Choose a provider other than none when file notes summary AI is enabled.',
          'Define the file notes summary model and base URL, or inherit Conversation AI settings.',
          'Configure the corresponding API key.',
        ],
      }),
      createAiIntegration({
        id: IntegrationProvider.AiSessionSynthesis,
        name: 'AI Session Synthesis',
        description: 'Summarizes new AI session notes into structured, searchable memory while preserving the raw transcript.',
        envPrefix: 'KB_AI_SESSION_SYNTHESIS',
        provider: environment.aiSessionSynthesisProvider,
        baseUrl: environment.aiSessionSynthesisBaseUrl,
        model: environment.aiSessionSynthesisModel,
        apiKey: environment.aiSessionSynthesisApiKey,
        checklist: [
          'Choose a provider other than none.',
          'Define the synthesis model and base URL.',
          'Configure the corresponding API key.',
        ],
        warningPrefix: 'AI Session Synthesis',
      }),
      createIntegration({
        id: IntegrationProvider.PushNotifications,
        name: 'Push Notifications',
        description: 'Receive browser push notifications for reminders and updates.',
        status: hasPushSubscription ? IntegrationSetupStatus.Connected : IntegrationSetupStatus.Missing,
        checklist: [
          'Allow browser notifications when prompted.',
          'Keep the push notifications card active to receive updates.',
        ],
      }),
      createIntegration({
        id: IntegrationProvider.DependencyWatcher,
        name: 'Dependency Watcher',
        description: 'Automatically check for new dependency versions, create notes with changelogs, and send email alerts for critical updates.',
        env: dependencyWatcherEnv,
        flags: [repos.length > 0, ...Object.values(dependencyWatcherEnv)],
        checklist: [
          'Connect GitHub App and select workspace repositories.',
          'Enable Dependency Watcher integration.',
          'Import dependencies from GitHub repositories.',
          'Configure AI provider for changelog analysis.',
        ],
        warnings: [
          repos.length === 0 ? 'Workspace has no linked repository. Connect GitHub and select repositories first.' : '',
          !dependencyWatcherAiActive ? 'AI provider is set to none. Changelog analysis will be skipped.' : '',
        ],
      }),
    ],
  };
}

function createIntegration(input: {
  id: string;
  name: string;
  description: string;
  env?: Record<string, boolean>;
  flags?: boolean[];
  status?: IntegrationStatusValue;
  links?: IntegrationLink[];
  checklist: string[];
  warnings?: string[];
}): IntegrationStatus {
  const env = input.env ?? {};
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    status: input.status ?? statusFromFlags(input.flags ?? Object.values(env)),
    requiredEnv: Object.keys(env),
    configuredEnv: configuredEnv(env),
    missingEnv: missingEnv(env),
    links: input.links ?? [],
    checklist: input.checklist,
    warnings: (input.warnings ?? []).filter(Boolean),
  };
}

function createAiIntegration(config: {
  id: IntegrationProvider;
  name: string;
  description: string;
  envPrefix: string;
  provider: AiProvider | string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  checklist: string[];
  warningPrefix?: string;
}): IntegrationStatus {
  const active = config.provider !== AiProvider.None;
  const env: Record<string, boolean> = {
    [`${config.envPrefix}_PROVIDER`]: active,
    [`${config.envPrefix}_BASE_URL`]: active ? Boolean(config.baseUrl) : true,
    [`${config.envPrefix}_MODEL`]: active ? Boolean(config.model) : true,
    [`${config.envPrefix}_API_KEY`]: active ? secretConfigured(config.apiKey || '') : true,
  };
  const label = config.warningPrefix ?? config.name.replace(/ AI$/, '');
  return createIntegration({
    id: config.id,
    name: config.name,
    description: config.description,
    env,
    flags: [active, ...Object.values(env)],
    checklist: config.checklist,
    warnings: [
      !active ? `${label} provider is set to none.` : '',
      active && !config.apiKey ? `${config.name} is active without an API key.` : '',
    ],
  });
}

@Injectable()
export class BuildIntegrationsUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
  ) {}

  async execute(userId = '') {
    const [workspaces, projects, pushSubs] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjects(userId),
      this.pushSubscriptionRepository.listByUserId(userId),
    ]);
    const mappedProjects: Project[] = projects.map((p) => ({
      projectSlug: p.projectSlug,
      displayName: p.displayName,
      workspaceSlug: p.workspaceSlug || '',
      repositories: p.repositories.map((repo) => ({
        id: repo.id,
        workspaceSlug: p.workspaceSlug || '',
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
      })),
      defaultTags: p.defaultTags,
      enabled: p.enabled,
      favorite: p.favorite,
    }));
    return buildIntegrationStatuses({
      environment: this.environmentProvider.read(),
      workspaces,
      projects: mappedProjects,
      hasPushSubscription: pushSubs.length > 0,
    });
  }
}
