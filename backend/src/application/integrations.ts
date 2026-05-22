import { Injectable } from '@nestjs/common';

import { AiProvider, IntegrationProvider, IntegrationSetupStatus } from '../contracts/enums.js';
import type { Project } from '../domain/projects.js';
import type { Workspace } from '../domain/workspaces.js';
import { ContentRepository } from './ports/content.repository.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from './ports/runtime-environment.port.js';
import { absoluteUrl, configuredEnv, link, missingEnv, secretConfigured, statusFromFlags, workspaceRepos } from './utils/integration-status.utils.js';

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
}): { ok: true; workspaceSlug: string; integrations: IntegrationStatus[] } {
  const { environment, workspaces, projects } = input;
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
  const githubFlags = [...Object.values(githubEnv), repos.length > 0];

  const webhookEnv = {
    KB_API_PUBLIC_BASE_URL: Boolean(environment.apiPublicBaseUrl || environment.publicBaseUrl),
    KB_GITHUB_WEBHOOK_PATH: Boolean(environment.githubPushWebhookPath),
    KB_INGEST_WEBHOOK_PATH: Boolean(environment.ingestWebhookPath),
    KB_WPP_WEBHOOK_PATH: Boolean(environment.whatsappWebhookPath),
    KB_QUERY_WEBHOOK_PATH: Boolean(environment.queryWebhookPath),
  };
  const apiBaseUrl = environment.apiPublicBaseUrl || environment.publicBaseUrl;
  const webhookLinks = [
    link('GitHub push webhook', absoluteUrl(apiBaseUrl, environment.githubPushWebhookPath), Boolean(apiBaseUrl)),
    link('Ingest webhook', absoluteUrl(apiBaseUrl, environment.ingestWebhookPath), Boolean(apiBaseUrl)),
    link('WhatsApp webhook', absoluteUrl(apiBaseUrl, environment.whatsappWebhookPath), Boolean(apiBaseUrl)),
    link('Query webhook', absoluteUrl(apiBaseUrl, environment.queryWebhookPath), Boolean(apiBaseUrl)),
  ];

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
  const whatsappChat = workspaceWhatsappChat;

  const telegramEnv = {
    KB_TELEGRAM_BOT_TOKEN: secretConfigured(environment.telegramBotToken),
    KB_TELEGRAM_CHAT_ID: Boolean(environment.telegramChatId),
  };
  const telegramChat = Boolean(environment.telegramChatId) || workspaceTelegramChat;

  const reviewAiActive = environment.reviewAiProvider !== AiProvider.None;
  const conversationAiActive = environment.conversationAiProvider !== AiProvider.None;
  const projectBriefAiActive = environment.projectBriefAiProvider !== AiProvider.None;
  const reviewAiEnv = {
    KB_REVIEW_AI_PROVIDER: reviewAiActive,
    KB_REVIEW_AI_BASE_URL: reviewAiActive ? Boolean(environment.reviewAiBaseUrl) : true,
    KB_REVIEW_AI_MODEL: reviewAiActive ? Boolean(environment.reviewAiModel) : true,
    KB_REVIEW_AI_API_KEY: reviewAiActive ? secretConfigured(environment.reviewAiApiKey) : true,
  };
  const conversationAiEnv = {
    KB_CONVERSATION_AI_PROVIDER: conversationAiActive,
    KB_CONVERSATION_AI_BASE_URL: conversationAiActive ? Boolean(environment.conversationAiBaseUrl) : true,
    KB_CONVERSATION_AI_MODEL: conversationAiActive ? Boolean(environment.conversationAiModel) : true,
    KB_CONVERSATION_AI_API_KEY: conversationAiActive ? secretConfigured(environment.conversationAiApiKey) : true,
  };
  const projectBriefAiEnv = {
    KB_PROJECT_BRIEF_AI_PROVIDER: projectBriefAiActive,
    KB_PROJECT_BRIEF_AI_BASE_URL: projectBriefAiActive ? Boolean(environment.projectBriefAiBaseUrl) : true,
    KB_PROJECT_BRIEF_AI_MODEL: projectBriefAiActive ? Boolean(environment.projectBriefAiModel) : true,
    KB_PROJECT_BRIEF_AI_API_KEY: projectBriefAiActive ? secretConfigured(environment.projectBriefAiApiKey) : true,
  };

  return {
    ok: true,
    workspaceSlug,
    integrations: [
      {
        id: IntegrationProvider.GithubApp,
        name: 'GitHub App',
        description: 'App installation, signed webhook, and installation token for push reviews.',
        status: statusFromFlags(githubFlags),
        requiredEnv: Object.keys(githubEnv),
        configuredEnv: configuredEnv(githubEnv),
        missingEnv: missingEnv(githubEnv),
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
        ].filter(Boolean),
      },
      {
        id: 'webhooks',
        name: 'Webhooks',
        description: 'Public URLs used by n8n, GitHub, WhatsApp, and query flows.',
        status: statusFromFlags(Object.values(webhookEnv)),
        requiredEnv: Object.keys(webhookEnv),
        configuredEnv: configuredEnv(webhookEnv),
        missingEnv: missingEnv(webhookEnv),
        links: webhookLinks,
        checklist: [
          'Publish the API behind a stable HTTPS URL.',
          'Point workflows and adapters to the displayed paths.',
          'Use the same base URL in external providers.',
        ],
        warnings: !apiBaseUrl ? ['KB_API_PUBLIC_BASE_URL is missing: showing relative paths instead of absolute URLs.'] : [],
      },
      {
        id: IntegrationProvider.Whatsapp,
        name: 'WhatsApp',
        description: 'Global Evolution API transport with a workspace-linked chat to capture notes for the correct user.',
        status: statusFromFlags([evolutionTransportConfigured, whatsappChat]),
        requiredEnv: Object.keys(whatsappEnv),
        configuredEnv: configuredEnv(whatsappEnv),
        missingEnv: missingEnv(whatsappEnv),
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
          !whatsappChat ? 'No WhatsApp chat is connected for this workspace.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.Telegram,
        name: 'Telegram',
        description: 'Bot and chat used for ingest notifications, reviews, and operational failures.',
        status: statusFromFlags([telegramEnv.KB_TELEGRAM_BOT_TOKEN, telegramChat]),
        requiredEnv: Object.keys(telegramEnv),
        configuredEnv: configuredEnv(telegramEnv),
        missingEnv: missingEnv(telegramEnv),
        links: [],
        checklist: [
          'Create or reuse a Telegram bot.',
          'Add the bot to the operational chat.',
          'Configure the global or workspace chat ID.',
        ],
        warnings: [
          !environment.telegramBotToken ? 'Telegram bot token is missing.' : '',
          !telegramChat ? 'Telegram chat ID is missing both in env and workspace.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.AiReview,
        name: 'Review AI',
        description: 'Server-managed provider and model for code reviews.',
        status: statusFromFlags([reviewAiActive, ...Object.values(reviewAiEnv)]),
        requiredEnv: Object.keys(reviewAiEnv),
        configuredEnv: configuredEnv(reviewAiEnv),
        missingEnv: missingEnv(reviewAiEnv),
        links: [],
        checklist: [
          'Choose a provider other than none when AI review is enabled.',
          'Define the review model and base URL.',
          'Configure the corresponding API key.',
        ],
        warnings: [
          !reviewAiActive ? 'Review provider is set to none.' : '',
          reviewAiActive && !environment.reviewAiApiKey ? 'Review AI is active without an API key.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.AiConversation,
        name: 'Conversation AI',
        description: 'Server-managed provider and model for conversation extraction.',
        status: statusFromFlags([conversationAiActive, ...Object.values(conversationAiEnv)]),
        requiredEnv: Object.keys(conversationAiEnv),
        configuredEnv: configuredEnv(conversationAiEnv),
        missingEnv: missingEnv(conversationAiEnv),
        links: [],
        checklist: [
          'Choose a provider other than none when conversation AI is enabled.',
          'Define the conversation model and base URL.',
          'Configure the corresponding API key.',
        ],
        warnings: [
          !conversationAiActive ? 'Conversation provider is set to none.' : '',
          conversationAiActive && !environment.conversationAiApiKey ? 'Conversation AI is active without an API key.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.ProjectBriefAi,
        name: 'Project Brief AI',
        description: 'Server-managed provider and model for manual project brief generation.',
        status: statusFromFlags([projectBriefAiActive, ...Object.values(projectBriefAiEnv)]),
        requiredEnv: Object.keys(projectBriefAiEnv),
        configuredEnv: configuredEnv(projectBriefAiEnv),
        missingEnv: missingEnv(projectBriefAiEnv),
        links: [],
        checklist: [
          'Choose a provider other than none when project brief AI is enabled.',
          'Define the project brief model and base URL, or inherit Conversation AI settings.',
          'Configure the corresponding API key.',
        ],
        warnings: [
          !projectBriefAiActive ? 'Project Brief provider is set to none.' : '',
          projectBriefAiActive && !environment.projectBriefAiApiKey ? 'Project Brief AI is active without an API key.' : '',
        ].filter(Boolean),
      },
    ],
  };
}

@Injectable()
export class BuildIntegrationsUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId = '') {
    const [workspaces, projects] = await Promise.all([this.contentRepository.listWorkspaces(userId), this.contentRepository.listProjects(userId)]);
    return buildIntegrationStatuses({ environment: this.environmentProvider.read(), workspaces, projects });
  }
}
