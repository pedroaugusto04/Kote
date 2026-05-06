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
  const workspaceWhatsappGroup = Boolean(workspace?.whatsappGroupJid);
  const workspaceTelegramChat = Boolean(workspace?.telegramChatId);

  const githubEnv = {
    KB_GITHUB_APP_INSTALL_URL: Boolean(environment.githubAppInstallUrl),
    KB_GITHUB_APP_WEBHOOK_SECRET: secretConfigured(environment.githubWebhookSecret),
    KB_GITHUB_APP_ID: Boolean(environment.githubAppId),
    KB_GITHUB_APP_PRIVATE_KEY: secretConfigured(environment.githubAppPrivateKey),
  };
  const githubFlags = [...Object.values(githubEnv), repos.length > 0];

  const webhookEnv = {
    KB_PUBLIC_BASE_URL: Boolean(environment.publicBaseUrl),
    KB_GITHUB_WEBHOOK_PATH: Boolean(environment.githubPushWebhookPath),
    KB_INGEST_WEBHOOK_PATH: Boolean(environment.ingestWebhookPath),
    KB_WPP_WEBHOOK_PATH: Boolean(environment.whatsappWebhookPath),
    KB_QUERY_WEBHOOK_PATH: Boolean(environment.queryWebhookPath),
  };
  const webhookLinks = [
    link('GitHub push webhook', absoluteUrl(environment.publicBaseUrl, environment.githubPushWebhookPath), Boolean(environment.publicBaseUrl)),
    link('Ingest webhook', absoluteUrl(environment.publicBaseUrl, environment.ingestWebhookPath), Boolean(environment.publicBaseUrl)),
    link('WhatsApp webhook', absoluteUrl(environment.publicBaseUrl, environment.whatsappWebhookPath), Boolean(environment.publicBaseUrl)),
    link('Query webhook', absoluteUrl(environment.publicBaseUrl, environment.queryWebhookPath), Boolean(environment.publicBaseUrl)),
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
  const whatsappGroup = workspaceWhatsappGroup;

  const telegramEnv = {
    KB_TELEGRAM_BOT_TOKEN: secretConfigured(environment.telegramBotToken),
    KB_TELEGRAM_CHAT_ID: Boolean(environment.telegramChatId),
  };
  const telegramChat = Boolean(environment.telegramChatId) || workspaceTelegramChat;

  const reviewAiActive = environment.reviewAiProvider !== AiProvider.None;
  const conversationAiActive = environment.conversationAiProvider !== AiProvider.None;
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

  return {
    ok: true,
    workspaceSlug,
    integrations: [
      {
        id: IntegrationProvider.GithubApp,
        name: 'GitHub App',
        description: 'Instalacao do app, webhook assinado e token de instalacao para reviews de push.',
        status: statusFromFlags(githubFlags),
        requiredEnv: Object.keys(githubEnv),
        configuredEnv: configuredEnv(githubEnv),
        missingEnv: missingEnv(githubEnv),
        links: environment.githubAppInstallUrl ? [link('Instalar GitHub App', environment.githubAppInstallUrl)] : [],
        checklist: [
          'Instalar o GitHub App nos repositorios do workspace.',
          'Configurar o webhook do app para o endpoint de GitHub push.',
          'Selecionar repositorios no workspace depois da conexao.',
        ],
        warnings: [
          !environment.githubWebhookSecret ? 'Webhook do GitHub sem secret configurado.' : '',
          !environment.githubAppId || !environment.githubAppPrivateKey ? 'GitHub App sem credenciais para gerar token de instalacao.' : '',
          repos.length === 0 ? 'Workspace sem repositorio vinculado.' : '',
        ].filter(Boolean),
      },
      {
        id: 'webhooks',
        name: 'Webhooks',
        description: 'URLs publicas usadas por n8n, GitHub, WhatsApp e consulta.',
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
        description: 'Transporte Evolution API global com grupo vinculado por workspace para capturar notas do usuario correto.',
        status: statusFromFlags([evolutionTransportConfigured, whatsappGroup]),
        requiredEnv: Object.keys(whatsappEnv),
        configuredEnv: configuredEnv(whatsappEnv),
        missingEnv: missingEnv(whatsappEnv),
        links: [
          environment.evolutionApiPublicUrl ? link('Evolution API', environment.evolutionApiPublicUrl) : null,
        ].filter(Boolean) as IntegrationLink[],
        checklist: [
          'Configurar a Evolution API global do servidor.',
          'Conectar o grupo do workspace pelo fluxo guiado para persistir o JID.',
          'Configurar o webhook do provedor para o path de WhatsApp.',
        ],
        warnings: [
          !evolutionTransportConfigured ? 'Evolution API incompleta: faltam URL, instance name, API key ou public URL.' : '',
          !whatsappGroup ? 'Nenhum grupo WhatsApp conectado para este workspace.' : '',
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
        id: IntegrationProvider.AiReview,
        name: 'IA de Review',
        description: 'Provider e modelo gerenciados pelo servidor para reviews de codigo.',
        status: statusFromFlags([reviewAiActive, ...Object.values(reviewAiEnv)]),
        requiredEnv: Object.keys(reviewAiEnv),
        configuredEnv: configuredEnv(reviewAiEnv),
        missingEnv: missingEnv(reviewAiEnv),
        links: [],
        checklist: [
          'Escolher provider diferente de none quando review por IA estiver habilitado.',
          'Definir modelo e base URL do review.',
          'Configurar a API key correspondente.',
        ],
        warnings: [
          !reviewAiActive ? 'Provider de review esta como none.' : '',
          reviewAiActive && !environment.reviewAiApiKey ? 'Review AI ativo sem API key.' : '',
        ].filter(Boolean),
      },
      {
        id: IntegrationProvider.AiConversation,
        name: 'IA de Conversa',
        description: 'Provider e modelo gerenciados pelo servidor para extracao em conversas.',
        status: statusFromFlags([conversationAiActive, ...Object.values(conversationAiEnv)]),
        requiredEnv: Object.keys(conversationAiEnv),
        configuredEnv: configuredEnv(conversationAiEnv),
        missingEnv: missingEnv(conversationAiEnv),
        links: [],
        checklist: [
          'Escolher provider diferente de none quando conversa por IA estiver habilitada.',
          'Definir modelo e base URL da conversa.',
          'Configurar a API key correspondente.',
        ],
        warnings: [
          !conversationAiActive ? 'Provider de conversa esta como none.' : '',
          conversationAiActive && !environment.conversationAiApiKey ? 'Conversation AI ativo sem API key.' : '',
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
