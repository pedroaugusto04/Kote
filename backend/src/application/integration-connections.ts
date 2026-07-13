import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException, Optional } from '@nestjs/common';
import crypto from 'node:crypto';

import { CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider, ExternalIdentityType, ExternalIdKey, WorkspaceBindingField, ConnectionCallbackStatus, MissingCredentialError } from '../contracts/enums.js';
import { slugify } from '../domain/strings.js';
import { encryptConfig } from './credentials.js';
import type { IntegrationConnectionSessionRecord, WorkspaceRecord } from './models/repository-records.models.js';
import { GithubIntegrationGateway } from './ports/integrations/github-integration.port.js';
import { ContentRepository } from './ports/notes/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository, IntegrationConnectionSessionRepository } from './ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from './ports/observability/runtime-environment.port.js';
import { AI_PROVIDERS_REGISTRY, getAiProviderConfig } from './ai-providers-registry.js';
import { GithubRepositoryResolutionService } from './services/integrations/github-repository-resolution.service.js';
import { WhatsappReplySender } from './ports/integrations/whatsapp-reply.sender.js';
import { TelegramMessageSender } from './ports/integrations/telegram-message.sender.js';
import { AppLogger } from '../observability/logger.js';
import {
  appendQuery,
  buildBrowserRedirectUrl,
  CONNECTED_STATUS,
  expiresAt,
  extractConnectionCommandCode,
  extractGithubInstallationId,
  normalizeBrowserOrigin,
  normalizeGithubAppInstallUrl,
  normalizeReturnToPath,
  PENDING_STATUS,
  publicSession,
  randomState,
  randomVerificationCode,
  sha256,
  type ConnectionSessionMetadata,
  type ConnectionSessionView,
} from './integrations/connection-session.helpers.js';

import { parseWhatsappEvolutionMessage } from './utils/webhook/webhook.utils.js';
import { WHATSAPP_INTRO_MESSAGE, TELEGRAM_INTRO_MESSAGE } from './integrations/connection-messages.js';

export type { ConnectionSessionView };

type GithubInstallation = {
  id?: number | string;
  account?: { login?: string };
};

type CodeBasedProvider = IntegrationProvider.Whatsapp | IntegrationProvider.Telegram;

type CodeBasedConnectionSpec = {
  provider: CodeBasedProvider;
  externalProvider: ExternalIdentityProvider.Whatsapp | ExternalIdentityProvider.Telegram;
  identityType: ExternalIdentityType;
  label: string;
  externalIdKey: ExternalIdKey;
  workspaceBinding: WorkspaceBindingField;
};

export function extractWhatsappConnectionCode(body: Record<string, unknown>): string {
  const parsed = parseWhatsappEvolutionMessage(body);
  if (parsed.kind === 'message') {
    return extractConnectionCommandCode(parsed.messageText);
  }
  return '';
}

export function extractTelegramConnectionCode(body: Record<string, unknown>): string {
  const message = body.message as Record<string, unknown> | undefined;
  const text = String(body.text || message?.text || '').trim();
  return extractConnectionCommandCode(text);
}

export function extractTelegramChatId(body: Record<string, unknown>): string {
  const message = body.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  return String(body.chatId || chat?.id || '').trim();
}

@Injectable()
export class IntegrationConnectionService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly sessions: IntegrationConnectionSessionRepository,
    private readonly content: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    @Optional() private readonly whatsappReplySender?: WhatsappReplySender,
    @Optional() private readonly telegramMessageSender?: TelegramMessageSender,
    @Optional() private readonly logger?: AppLogger,
  ) {}

  private environment() {
    return this.environmentProvider.read();
  }

  async connect(input: { userId: string; workspaceSlug: string; provider: string; returnToPath?: string; browserOrigin?: string }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    if (input.provider === IntegrationProvider.GithubApp) return this.startGithubConnection(input.userId, workspace.workspaceSlug, input.returnToPath, input.browserOrigin);
    if (input.provider === IntegrationProvider.Whatsapp) return this.startWhatsappConnection(input.userId, workspace.workspaceSlug);
    if (input.provider === IntegrationProvider.Telegram) return this.startTelegramConnection(input.userId, workspace.workspaceSlug);
    if (input.provider in AI_PROVIDERS_REGISTRY) return this.activateAi(input.userId, workspace.workspaceSlug, input.provider as any);
    throw new NotFoundException('provider_not_found');
  }

  async session(input: { userId: string; provider: string; sessionId: string }) {
    const session = await this.sessions.findConnectionSession(input.sessionId);
    if (!session || session.provider !== input.provider || session.userId !== input.userId) throw new NotFoundException('connection_session_not_found');
    return { ok: true as const, session: publicSession(session) };
  }

  private async upsertGithubCredentialAndIdentity(userId: string, workspaceSlug: string, installationId: string, accountLogin: string) {
    const credential = await this.upsertConnectedCredential({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.GithubApp,
      encryptedConfig: { installationId, accountLogin },
      publicMetadata: {
        label: accountLogin ? `GitHub ${accountLogin}` : 'GitHub App',
        connectedAccount: accountLogin || installationId,
      },
    });
    await this.upsertExternalIdentity({
      userId,
      workspaceSlug,
      provider: ExternalIdentityProvider.GithubApp,
      identityType: 'installation_id',
      externalId: installationId,
      credentialId: credential.id,
      publicMetadata: { accountLogin },
    });
    return credential;
  }

  private async completeGithubWithSession(session: IntegrationConnectionSessionRecord, rawInstallationId: string) {
    const installationId = extractGithubInstallationId(rawInstallationId);
    const userId = session.userId;
    try {
      const installation = await this.verifyGithubInstallation(installationId);
      const accountLogin = this.normalizeGithubAccountLogin(installation);
      await this.assertExternalIdentityAvailable(ExternalIdentityProvider.GithubApp, 'installation_id', installationId, userId);
      await this.upsertGithubCredentialAndIdentity(userId, session.workspaceSlug || '', installationId, accountLogin);
      const consumed = await this.consumeSessionAsConnected(session.id, { installationId, connectedAccount: accountLogin || installationId });
      const finalSession = consumed || session;
      return {
        ok: true as const,
        provider: IntegrationProvider.GithubApp,
        session: publicSession(finalSession),
        connectedAccount: accountLogin || installationId,
        redirectUrl: this.buildGithubCallbackRedirect(finalSession, ConnectionCallbackStatus.Connected),
      };
    } catch (error) {
      await this.sessions.consumeConnectionSession(session.id, 'error', { lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async completeGithub(input: { userId: string; state: string; installationId: string }) {
    const session = await this.sessions.findActiveConnectionSessionByState(IntegrationProvider.GithubApp, sha256(input.state), new Date().toISOString());
    if (!session || session.userId !== input.userId) throw new UnauthorizedException('invalid_connection_state');
    return this.completeGithubWithSession(session, input.installationId);
  }

  async completeGithubForBrowser(input: { userId: string; state: string; installationId: string }) {
    const session = await this.sessions.findActiveConnectionSessionByState(IntegrationProvider.GithubApp, sha256(input.state), new Date().toISOString());
    if (!session || session.userId !== input.userId) {
      return { redirectUrl: this.fallbackGithubCallbackRedirect() };
    }
    try {
      const result = await this.completeGithubWithSession(session, input.installationId);
      return { redirectUrl: result.redirectUrl };
    } catch {
      return { redirectUrl: this.buildGithubCallbackRedirect(session, ConnectionCallbackStatus.Error) };
    }
  }

  async updateGithubInstallation(input: { userId: string; installationId: string }) {
    const installationId = extractGithubInstallationId(input.installationId);
    const environment = this.environment();

    if (!environment.githubAppId || !environment.githubAppPrivateKey) {
      throw new BadRequestException('github_app_installation_not_configured');
    }

    // Verify the installation is accessible
    const installation = await this.verifyGithubInstallation(installationId);
    const accountLogin = this.normalizeGithubAccountLogin(installation);

    // Find existing GitHub App credential for this user
    const existingCredential = await this.credentials.findCredential(input.userId, '', IntegrationProvider.GithubApp);
    if (!existingCredential) {
      throw new NotFoundException('github_integration_not_found');
    }

    // Update the credential and external identity
    await this.upsertGithubCredentialAndIdentity(input.userId, existingCredential.workspaceSlug || '', installationId, accountLogin);

    return {
      ok: true as const,
      provider: IntegrationProvider.GithubApp,
      updatedInstallationId: installationId,
      accountLogin,
    };
  }

  async completeWhatsappFromWebhook(input: { code: string; chatJid: string }) {
    return this.completeCodeBasedConnection({
      code: input.code,
      externalId: input.chatJid,
      spec: {
        provider: IntegrationProvider.Whatsapp,
        externalProvider: ExternalIdentityProvider.Whatsapp,
        identityType: ExternalIdentityType.Jid,
        label: 'Chat WhatsApp',
        externalIdKey: ExternalIdKey.ChatJid,
        workspaceBinding: WorkspaceBindingField.WhatsappChatJid,
      },
    });
  }

  async completeTelegramFromWebhook(input: { code: string; chatId: string }) {
    return this.completeCodeBasedConnection({
      code: input.code,
      externalId: input.chatId,
      spec: {
        provider: IntegrationProvider.Telegram,
        externalProvider: ExternalIdentityProvider.Telegram,
        identityType: ExternalIdentityType.ChatId,
        label: 'Chat Telegram',
        externalIdKey: ExternalIdKey.ChatId,
        workspaceBinding: WorkspaceBindingField.TelegramChatId,
      },
    });
  }

  async listGithubRepositories(input: { userId: string; workspaceSlug: string }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    const workspaceSlug = workspace.workspaceSlug;
    const repositories = await this.githubRepositoryResolution.listAccessibleRepositories({
      userId: input.userId,
      workspaceSlug,
      missingCredentialError: MissingCredentialError.NotFound,
    });
    const projects = await this.content.listProjects(input.userId);
    const selected = new Set(projects.filter(p => p.workspaceSlug === workspaceSlug).flatMap(p => p.repositories.map(r => r.fullName)));
    return {
      ok: true as const,
      workspaceSlug,
      repositories: this.githubRepositoryResolution.markSelectedRepositories(repositories, selected),
    };
  }

  async saveGithubRepositories(input: { userId: string; workspaceSlug: string; repositories: { id: string; fullName: string }[] }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    const workspaceSlug = workspace.workspaceSlug;
    const now = new Date().toISOString();
    await this.content.upsertWorkspace(input.userId, {
      id: workspace.id,
      workspaceSlug,
      displayName: workspace.displayName,
      whatsappChatJid: workspace.whatsappChatJid,
      telegramChatId: workspace.telegramChatId,
      createdAt: workspace.createdAt,
      updatedAt: now,
    });
    const savedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId: input.userId,
      workspaceSlug,
      repositoryIds: input.repositories.map((repo) => repo.id),
      missingCredentialError: MissingCredentialError.NotFound,
    });

    // Build set of currently selected repository full names
    const selectedRepoFullNames = new Set(input.repositories.map((repo) => repo.fullName));

    // Get existing workspace projects to handle deselections
    const existingProjects = await this.content.listProjects(input.userId);
    const workspaceProjects = existingProjects.filter((p) => p.workspaceSlug === workspaceSlug);

    // Disable projects whose repositories were deselected
    const deselectedProjects = workspaceProjects.filter((project) =>
      project.repositories.length > 0 && !selectedRepoFullNames.has(project.repositories[0].fullName)
    );
    await Promise.all(deselectedProjects.map((project) =>
      this.content.upsertProject(input.userId, {
        ...project,
        enabled: false,
      }),
    ));

    // Create/update projects for selected repositories
    const projects = await Promise.all(savedRepositories.map((repo) => {
      const repositoryName = repo.fullName.split('/').pop() || repo.fullName;
      const projectSlug = slugify(repositoryName) || 'inbox';
      // Try to find existing project for this repository
      const existingProject = workspaceProjects.find((p) => p.repositories[0]?.fullName === repo.fullName);
      return this.content.upsertProject(input.userId, {
        id: existingProject?.id || crypto.randomUUID(),
        projectSlug,
        displayName: repositoryName,
        workspaceId: workspace.id,
        workspaceSlug,
        repositories: [repo],
        defaultTags: existingProject?.defaultTags || [],
        enabled: true,
        favorite: existingProject?.favorite || false,
      });
    }));

    return {
      ok: true as const,
      workspaceSlug,
      repositories: savedRepositories.map((repo) => ({ id: repo.externalId, fullName: repo.fullName })),
      projects,
    };
  }

  private async startGithubConnection(userId: string, workspaceSlug: string, returnToPath?: string, browserOrigin?: string) {
    const environment = this.environment();
    if (!environment.githubAppInstallUrl) throw new BadRequestException('github_app_install_url_not_configured');
    const state = randomState();
    const session = await this.createConnectionSession({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.GithubApp,
      stateHash: sha256(state),
      verificationCodeHash: '',
      status: PENDING_STATUS,
      metadata: {
        browserOrigin: normalizeBrowserOrigin(browserOrigin),
        returnToPath: normalizeReturnToPath(returnToPath, '/settings/integrations'),
      },
    });
    return {
      ok: true as const,
      provider: IntegrationProvider.GithubApp,
      session: publicSession(session),
      primaryAction: {
        type: 'external_redirect',
        label: 'Connect GitHub',
        url: appendQuery(normalizeGithubAppInstallUrl(environment.githubAppInstallUrl), { state }),
      },
      steps: ['Install the GitHub App in the desired repositories.', 'Wait for the callback to finish the link.'],
    };
  }

  private async startWhatsappConnection(userId: string, workspaceSlug: string) {
    return this.startCodeBasedConnection({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Whatsapp,
      label: 'Connect WhatsApp',
      steps: ['Send the message in the WhatsApp chat.', 'Keep this window open until the conversation appears as connected.'],
    });
  }

  private async startTelegramConnection(userId: string, workspaceSlug: string) {
    const environment = this.environment();
    if (!environment.telegramBotToken) throw new BadRequestException('telegram_bot_token_not_configured');
    return this.startCodeBasedConnection({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Telegram,
      label: 'Connect Telegram',
      steps: ['Send the message in the Telegram chat.', 'Keep this window open until the chat appears as connected.'],
    });
  }

  private async activateAi(userId: string, workspaceSlug: string, provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation | IntegrationProvider.ProjectBriefAi | IntegrationProvider.PrContextAi) {
    const environment = this.environment();
    const config = getAiProviderConfig(provider, environment);
    const configured = config.provider !== 'none' && config.baseUrl && config.model && config.apiKey;
    if (!configured) throw new BadRequestException(config.errorCode);
    const credential = await this.credentials.upsertCredential({
      userId,
      workspaceSlug,
      provider,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ enabled: true }, this.environmentProvider),
      publicMetadata: {
        label: config.label,
        connectedAccount: config.provider,
      },
    });
    return {
      ok: true as const,
      provider,
      integration: {
        provider,
        status: credential.status,
        connectedAccount: config.provider,
        updatedAt: credential.updatedAt,
      },
      steps: ['This feature is active for this workspace.'],
    };
  }

  private async verifyGithubInstallation(installationId: string): Promise<GithubInstallation> {
    const environment = this.environment();
    if (!environment.githubAppId || !environment.githubAppPrivateKey) throw new BadRequestException('github_app_installation_not_configured');
    const token = await this.githubIntegrationGateway.fetchInstallationToken({
      appId: environment.githubAppId,
      privateKey: environment.githubAppPrivateKey,
      installationId,
    });
    if (!token) throw new UnauthorizedException('github_installation_not_accessible');
    const repositories = await this.githubIntegrationGateway.fetchInstallationRepositories({
      appId: environment.githubAppId,
      privateKey: environment.githubAppPrivateKey,
      installationId,
    });
    return {
      id: installationId,
      account: { login: repositories[0]?.owner || '' },
    };
  }

  private async createConnectionSession(
    input: Pick<
      IntegrationConnectionSessionRecord,
      'userId' | 'workspaceSlug' | 'provider' | 'stateHash' | 'verificationCodeHash' | 'status' | 'metadata'
    >,
  ) {
    return this.sessions.createConnectionSession({
      ...input,
      expiresAt: expiresAt(),
    });
  }

  private async startCodeBasedConnection(input: { userId: string; workspaceSlug: string; provider: CodeBasedProvider; label: string; steps: string[] }) {
    const verificationCode = randomVerificationCode();
    const session = await this.createConnectionSession({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      provider: input.provider,
      stateHash: '',
      verificationCodeHash: sha256(verificationCode),
      status: PENDING_STATUS,
      metadata: {},
    });
    return {
      ok: true as const,
      provider: input.provider,
      session: publicSession(session),
      primaryAction: {
        type: 'open_modal',
        label: input.label,
      },
      verificationCode,
      instruction: `/kote connect ${verificationCode}`,
      steps: input.steps,
    };
  }

  private async completeCodeBasedConnection(input: { code: string; externalId: string; spec: CodeBasedConnectionSpec }) {
    const externalId = input.externalId.trim();
    if (!externalId) throw new UnauthorizedException('missing_external_identity');
    const session = await this.requireCodeSession(input.spec.provider, input.code);
    await this.assertExternalIdentityAvailable(input.spec.externalProvider, input.spec.identityType, externalId, session.userId, session.workspaceSlug);
    const credential = await this.upsertConnectedCredential({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug || '',
      provider: input.spec.provider,
      encryptedConfig: { [input.spec.externalIdKey]: externalId },
      publicMetadata: {
        label: input.spec.label,
        connectedAccount: externalId,
      },
    });
    await this.upsertExternalIdentity({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug || '',
      provider: input.spec.externalProvider,
      identityType: input.spec.identityType,
      externalId,
      credentialId: credential.id,
      publicMetadata: { [input.spec.externalIdKey]: externalId },
    });
    await this.upsertWorkspaceBinding(session.userId, session.workspaceSlug || '', input.spec.workspaceBinding, externalId);
    const consumed = await this.consumeSessionAsConnected(session.id, { connectedAccount: externalId });

    try {
      if (input.spec.provider === IntegrationProvider.Whatsapp && this.whatsappReplySender) {
        await this.whatsappReplySender.sendText({
          chatJid: externalId,
          text: WHATSAPP_INTRO_MESSAGE,
        });
      } else if (input.spec.provider === IntegrationProvider.Telegram && this.telegramMessageSender) {
        await this.telegramMessageSender.sendText({
          chatId: externalId,
          text: TELEGRAM_INTRO_MESSAGE,
        });
      }
    } catch (error) {
      this.logger?.error('connection.introduction_send_failed', {
        provider: input.spec.provider,
        externalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ok: true as const,
      provider: input.spec.provider,
      resolvedUserId: session.userId,
      workspaceSlug: session.workspaceSlug,
      session: publicSession(consumed || session),
    };
  }

  private async requireCodeSession(provider: CodeBasedProvider, code: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) throw new NotFoundException('connection_session_not_found');
    const session = await this.sessions.findActiveConnectionSessionByCode(provider, sha256(normalizedCode), new Date().toISOString());
    if (!session) throw new NotFoundException('connection_session_not_found');
    return session;
  }

  private async assertExternalIdentityAvailable(provider: string, identityType: string, externalId: string, userId: string, workspaceSlug?: string) {
    const existing = await this.externalIdentities.findExternalIdentity(provider, identityType, externalId);
    if (existing && (existing.userId !== userId || (workspaceSlug && existing.workspaceSlug !== workspaceSlug))) {
      throw new ConflictException('external_identity_already_bound');
    }
  }

  private async upsertConnectedCredential(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    encryptedConfig: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }) {
    return this.credentials.upsertCredential({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      provider: input.provider,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig(input.encryptedConfig, this.environmentProvider),
      publicMetadata: input.publicMetadata,
    });
  }

  private async upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId: string;
    publicMetadata: Record<string, unknown>;
  }) {
    await this.externalIdentities.upsertExternalIdentity({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      provider: input.provider,
      identityType: input.identityType,
      externalId: input.externalId,
      credentialId: input.credentialId,
      metadata: {},
      publicMetadata: input.publicMetadata,
    });
  }

  private async consumeSessionAsConnected(sessionId: string, metadata: Record<string, unknown>) {
    return this.sessions.consumeConnectionSession(sessionId, CONNECTED_STATUS, metadata);
  }

  private normalizeGithubAccountLogin(installation: GithubInstallation) {
    return String(installation.account?.login ?? '').trim();
  }

  private async upsertWorkspaceBinding(
    userId: string,
    workspaceSlug: string,
    field: WorkspaceBindingField,
    value: string,
  ) {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = await this.requireWorkspace(userId, workspaceSlug);
    await this.content.upsertWorkspace(userId, { ...workspace, [field]: value, updatedAt: now });
  }

  private async requireWorkspace(userId: string, workspaceSlug: string) {
    const normalized = slugify(workspaceSlug);
    if (!normalized) throw new BadRequestException('workspace_slug_required');
    const workspace = (await this.content.listWorkspaces(userId)).find((item) => item.workspaceSlug === normalized);
    if (!workspace) throw new NotFoundException('workspace_not_found');
    return workspace;
  }

  private getGithubRedirectUrl(origin: string, path: string | undefined, status: ConnectionCallbackStatus, workspaceSlug?: string) {
    const base = buildBrowserRedirectUrl(origin, path);
    base.searchParams.set('integration', IntegrationProvider.GithubApp);
    base.searchParams.set('status', status);
    if (workspaceSlug) {
      base.searchParams.set('workspaceSlug', workspaceSlug);
    }
    return origin ? base.toString() : `${base.pathname}${base.search}${base.hash}`;
  }

  private buildGithubCallbackRedirect(session: IntegrationConnectionSessionRecord, status: ConnectionCallbackStatus) {
    const environment = this.environment();
    const metadata = session.metadata as ConnectionSessionMetadata;
    const origin = normalizeBrowserOrigin(metadata.browserOrigin) || environment.publicBaseUrl || '';
    return this.getGithubRedirectUrl(origin, metadata.returnToPath, status, session.workspaceSlug || undefined);
  }

  private fallbackGithubCallbackRedirect() {
    const environment = this.environment();
    const origin = environment.publicBaseUrl || '';
    return this.getGithubRedirectUrl(origin, '/settings/integrations', ConnectionCallbackStatus.Error);
  }
}
