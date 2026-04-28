import { Injectable } from '@nestjs/common';

import { readEnvironment, type RuntimeEnvironment } from '../adapters/environment.js';
import { AiProvider, IntegrationProvider, IntegrationSetupStatus } from '../contracts/enums.js';
import type { Project } from '../domain/projects.js';
import type { Workspace } from '../domain/workspaces.js';
import { ContentRepository } from './ports/repositories.js';
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
  const workspaceWhatsappGroup = Boolean(workspace?.whatsappGroupJid);
  const workspaceTelegramChat = Boolean(workspace?.telegramChatId);

  const githubEnv = {
    KB_GITHUB_APP_INSTALL_URL: Boolean(environment.githubAppInstallUrl),
    KB_GITHUB_APP_WEBHOOK_SECRET: secretConfigured(environment.githubWebhookSecret),
    KB_GITHUB_API_TOKEN: secretConfigured(environment.githubApiToken),
  };
  const githubFlags = [...Object.values(githubEnv), repos.length > 0];

  const webhookEnv = {
    KB_PUBLIC_BASE_URL: Boolean(environment.publicBaseUrl),
    KB_GITHUB_WEBHOOK_PATH: Boolean(environment.githubPushWebhookPath),
    KB_INGEST_WEBHOOK_PATH: Boolean(environment.ingestWebhookPath),
    KB_WPP_WEBHOOK_PATH: Boolean(environment.whatsappWebhookPath),
    KB_ONBOARDING_WEBHOOK_PATH: Boolean(environment.onboardingWebhookPath),
    KB_QUERY_WEBHOOK_PATH: Boolean(environment.queryWebhookPath),
  };
  const webhookLinks = [
    link('GitHub push webhook', absoluteUrl(environment.publicBaseUrl, environment.githubPushWebhookPath), Boolean(environment.publicBaseUrl)),
    link('Ingest webhook', absoluteUrl(environment.publicBaseUrl, environment.ingestWebhookPath), Boolean(environment.publicBaseUrl)),
    link('WhatsApp webhook', absoluteUrl(environment.publicBaseUrl, environment.whatsappWebhookPath), Boolean(environment.publicBaseUrl)),
    link('Onboarding webhook', absoluteUrl(environment.publicBaseUrl, environment.onboardingWebhookPath), Boolean(environment.publicBaseUrl)),
    link('Query webhook', absoluteUrl(environment.publicBaseUrl, environment.queryWebhookPath), Boolean(environment.publicBaseUrl)),
  ];

  const evolutionConfigured = Boolean(environment.evolutionApiUrl && environment.evolutionInstanceName && environment.evolutionApiKey);
  const whatsappEnv = {
    KB_WPP_PAIRING_URL: Boolean(environment.whatsappPairingUrl),
    EVOLUTION_API_URL: Boolean(environment.evolutionApiUrl),
    EVOLUTION_INSTANCE_NAME: Boolean(environment.evolutionInstanceName),
    EVOLUTION_API_KEY: secretConfigured(environment.evolutionApiKey),
    WPP_KB_GROUP_JID: Boolean(environment.allowedGroupId),
  };
  const whatsappTransport = Boolean(environment.whatsappPairingUrl) || evolutionConfigured;
  const whatsappGroup = Boolean(environment.allowedGroupId) || workspaceWhatsappGroup;

  const telegramEnv = {
    KB_TELEGRAM_BOT_TOKEN: secretConfigured(environment.telegramBotToken),
    KB_TELEGRAM_CHAT_ID: Boolean(environment.telegramChatId),
  };
  const telegramChat = Boolean(environment.telegramChatId) || workspaceTelegramChat;

  const reviewAiActive = environment.reviewAiProvider !== AiProvider.None;
  const conversationAiActive = environment.conversationAiProvider !== AiProvider.None;
  const aiEnv = {
    KB_REVIEW_AI_PROVIDER: reviewAiActive,
    KB_REVIEW_AI_BASE_URL: reviewAiActive ? Boolean(environment.reviewAiBaseUrl) : true,
    KB_REVIEW_AI_MODEL: reviewAiActive ? Boolean(environment.reviewAiModel) : true,
    KB_REVIEW_AI_API_KEY: reviewAiActive ? secretConfigured(environment.reviewAiApiKey) : true,
    KB_CONVERSATION_AI_PROVIDER: conversationAiActive,
    KB_CONVERSATION_AI_BASE_URL: conversationAiActive ? Boolean(environment.conversationAiBaseUrl) : true,
    KB_CONVERSATION_AI_MODEL: conversationAiActive ? Boolean(environment.conversationAiModel) : true,
    KB_CONVERSATION_AI_API_KEY: conversationAiActive ? secretConfigured(environment.conversationAiApiKey) : true,
  };
  const aiFlags = [reviewAiActive || conversationAiActive, ...Object.values(aiEnv)];

  return {
    ok: true,
    workspaceSlug,
    integrations: [
      {
        id: IntegrationProvider.GithubApp,
        name: 'GitHub App',
        description: 'Instalacao do app, webhook assinado e token de leitura para reviews de push.',
        status: statusFromFlags(githubFlags),
        requiredEnv: Object.keys(githubEnv),
        configuredEnv: configuredEnv(githubEnv),
        missingEnv: missingEnv(githubEnv),
        links: environment.githubAppInstallUrl ? [link('Instalar GitHub App', environment.githubAppInstallUrl)] : [],
        checklist: [
          'Instalar o GitHub App nos repositorios do workspace.',
          'Configurar o webhook do app para o endpoint de GitHub push.',
          'Cadastrar repositorios no onboarding ou manifesto do workspace.',
        ],
        warnings: [
          !environment.githubWebhookSecret ? 'Webhook do GitHub sem secret configurado.' : '',
          !environment.githubApiToken ? 'Token de API do GitHub ausente para coletar diffs e commits.' : '',
          repos.length === 0 ? 'Workspace sem repositorio vinculado.' : '',
        ].filter(Boolean),
      },
      {
        id: 'webhooks',
        name: 'Webhooks',
        description: 'URLs publicas usadas por n8n, GitHub, WhatsApp, onboarding e consulta.',
        status: statusFromFlags(Object.values(webhookEnv)),
        requiredEnv: Object.keys(webhookEnv),
        configuredEnv: configuredEnv(webhookEnv),
        missingEnv: missingEnv(webhookEnv),
        links: webhookLinks,
        checklist: [
          'Publicar a API por uma URL HTTPS estavel.',
          'Apontar os workflows/adapters para os paths exibidos.',
          'Usar o mesmo base URL nos provedores externos.',
        ],
        warnings: !environment.publicBaseUrl ? ['KB_PUBLIC_BASE_URL ausente: exibindo paths relativos, nao URLs absolutas.'] : [],
      },
      {
        id: IntegrationProvider.Whatsapp,
        name: 'WhatsApp',
        description: 'Pairing ou Evolution API para captura e resposta no grupo autorizado.',
        status: statusFromFlags([whatsappTransport, whatsappGroup]),
        requiredEnv: Object.keys(whatsappEnv),
        configuredEnv: configuredEnv(whatsappEnv),
        missingEnv: missingEnv(whatsappEnv),
        links: [
          environment.whatsappPairingUrl ? link('Abrir pairing', environment.whatsappPairingUrl) : null,
          environment.evolutionApiPublicUrl ? link('Evolution API', environment.evolutionApiPublicUrl) : null,
        ].filter(Boolean) as IntegrationLink[],
        checklist: [
          'Conectar a conta pelo pairing ou configurar Evolution API.',
          'Autorizar o grupo do workspace por JID.',
          'Configurar o webhook do provedor para o path de WhatsApp.',
        ],
        warnings: [
          !whatsappTransport ? 'Sem pairing URL e sem Evolution API completa.' : '',
          !whatsappGroup ? 'Nenhum grupo autorizado em WPP_KB_GROUP_JID ou no workspace.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.Telegram,
        name: 'Telegram',
        description: 'Bot e chat usados para notificacoes de ingest, reviews e falhas operacionais.',
        status: statusFromFlags([telegramEnv.KB_TELEGRAM_BOT_TOKEN, telegramChat]),
        requiredEnv: Object.keys(telegramEnv),
        configuredEnv: configuredEnv(telegramEnv),
        missingEnv: missingEnv(telegramEnv),
        links: [],
        checklist: [
          'Criar ou reutilizar um bot do Telegram.',
          'Adicionar o bot ao chat operacional.',
          'Configurar o chat ID global ou no workspace.',
        ],
        warnings: [
          !environment.telegramBotToken ? 'Bot token do Telegram ausente.' : '',
          !telegramChat ? 'Chat ID do Telegram ausente no env e no workspace.' : '',
        ].filter(Boolean),
      },
      {
        id: 'ai',
        name: 'AI',
        description: 'Providers e modelos para reviews de codigo e conversa no WhatsApp.',
        status: statusFromFlags(aiFlags),
        requiredEnv: Object.keys(aiEnv),
        configuredEnv: configuredEnv(aiEnv),
        missingEnv: missingEnv(aiEnv),
        links: [],
        checklist: [
          'Escolher provider diferente de none quando IA estiver habilitada.',
          'Definir modelo e base URL para cada fluxo ativo.',
          'Configurar a API key correspondente ao provider.',
        ],
        warnings: [
          !reviewAiActive && !conversationAiActive ? 'Providers de IA estao como none.' : '',
          reviewAiActive && !environment.reviewAiApiKey ? 'Review AI ativo sem API key.' : '',
          conversationAiActive && !environment.conversationAiApiKey ? 'Conversation AI ativo sem API key.' : '',
        ].filter(Boolean),
      },
    ],
  };
}

@Injectable()
export class BuildIntegrationsUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId = '') {
    const [workspaces, projects] = await Promise.all([this.contentRepository.listWorkspaces(userId), this.contentRepository.listProjects(userId)]);
    return buildIntegrationStatuses({ environment: readEnvironment(), workspaces, projects });
  }
}
