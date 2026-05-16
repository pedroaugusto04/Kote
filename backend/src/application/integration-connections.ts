import crypto from 'node:crypto';

import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider } from '../contracts/enums.js';
import { slugify } from '../domain/strings.js';
import { encryptConfig } from './credentials.js';
import type { IntegrationConnectionSessionRecord, WorkspaceRecord } from './models/repository-records.models.js';
import { GithubIntegrationGateway } from './ports/github-integration.port.js';
import { ContentRepository } from './ports/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository, IntegrationConnectionSessionRepository } from './ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from './ports/runtime-environment.port.js';
import { GithubRepositoryResolutionService } from './services/github-repository-resolution.service.js';

const CONNECTION_TTL_MS = 10 * 60 * 1000;
const PENDING_STATUS = 'pending';
const CONNECTED_STATUS = 'connected';

type ConnectionSessionMetadata = {
  browserOrigin?: string;
  returnToPath?: string;
  connectedAccount?: string;
  lastError?: string;
  installationId?: string;
};

export type ConnectionSessionView = {
  id: string;
  provider: string;
  status: string;
  workspaceSlug: string;
  expiresAt: string;
  consumedAt: string | null;
  connectedAccount?: string;
  lastError?: string;
};

type GithubInstallation = {
  id?: number | string;
  account?: { login?: string };
};

type CodeBasedProvider = IntegrationProvider.Whatsapp | IntegrationProvider.Telegram;

type CodeBasedConnectionSpec = {
  provider: CodeBasedProvider;
  externalProvider: ExternalIdentityProvider.Whatsapp | ExternalIdentityProvider.Telegram;
  identityType: 'jid' | 'chat_id';
  label: string;
  externalIdKey: 'groupJid' | 'chatId';
  workspaceBinding: 'whatsappGroupJid' | 'telegramChatId';
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function randomVerificationCode(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
}

function expiresAt(): string {
  return new Date(Date.now() + CONNECTION_TTL_MS).toISOString();
}

function isExpired(session: IntegrationConnectionSessionRecord): boolean {
  return session.expiresAt <= new Date().toISOString();
}

function publicSession(session: IntegrationConnectionSessionRecord): ConnectionSessionView {
  const status = session.status === PENDING_STATUS && isExpired(session) ? 'expired' : session.status;
  return {
    id: session.id,
    provider: session.provider,
    status,
    workspaceSlug: session.workspaceSlug,
    expiresAt: session.expiresAt,
    consumedAt: session.consumedAt,
    connectedAccount: typeof (session.metadata as ConnectionSessionMetadata).connectedAccount === 'string' ? (session.metadata as ConnectionSessionMetadata).connectedAccount : undefined,
    lastError: typeof (session.metadata as ConnectionSessionMetadata).lastError === 'string' ? (session.metadata as ConnectionSessionMetadata).lastError : undefined,
  };
}

function appendQuery(url: string, query: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

function normalizeGithubAppInstallUrl(url: string): string {
  const parsed = new URL(url);
  const settingsAppMatch = parsed.pathname.match(/^\/settings\/apps\/([^/]+)\/?$/);
  if (parsed.origin === 'https://github.com' && settingsAppMatch) {
    parsed.pathname = `/apps/${settingsAppMatch[1]}/installations/new`;
    parsed.search = '';
    parsed.hash = '';
  }
  return parsed.toString();
}

function extractGithubInstallationId(value: unknown): string {
  const installationId = String(value ?? '').trim();
  if (!installationId) throw new BadRequestException('github_callback_missing_installation');
  return installationId;
}

function normalizeTrimmedValue(value: string): string {
  const normalized = value.trim();
  return normalized;
}

function normalizeWorkspaceSlug(value: string): string {
  return slugify(value);
}

function normalizeReturnToPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const parsed = new URL(value, 'https://knowledge-base.local');
    if (parsed.origin !== 'https://knowledge-base.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function normalizeBrowserOrigin(value: string | undefined): string {
  try {
    if (!value) return '';
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function buildBrowserRedirectUrl(baseUrl: string | undefined, path: string): URL {
  const normalizedPath = normalizeReturnToPath(path, '/settings/integrations');
  const fallbackBase = new URL('https://knowledge-base.local');
  const base = baseUrl ? new URL(baseUrl) : fallbackBase;
  const basePathname = base.pathname.replace(/\/+$/, '');
  const finalPath = normalizedPath === '/'
    ? (basePathname || '/')
    : basePathname && !normalizedPath.startsWith(`${basePathname}/`) && normalizedPath !== basePathname
      ? `${basePathname}${normalizedPath}`
      : normalizedPath;
  base.pathname = finalPath;
  base.search = '';
  base.hash = '';
  return base;
}

export function extractWhatsappConnectionCode(body: Record<string, unknown>): string {
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data as Record<string, unknown> : undefined;
  const payload = data || body;
  const message = payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message) ? payload.message as Record<string, unknown> : undefined;
  const bodyMessageText = typeof body.message === 'string' || typeof body.message === 'number' ? String(body.message) : '';
  const extendedText = message?.extendedTextMessage as Record<string, unknown> | undefined;
  const text = String(
    body.text ||
      bodyMessageText ||
      body.body ||
      payload.text ||
      payload.body ||
      message?.conversation ||
      extendedText?.text ||
      '',
  ).trim();
  const match = text.match(/^\/kb\s+conectar\s+([a-z0-9-]{4,20})$/i);
  return match?.[1]?.trim().toUpperCase() || '';
}

export function extractTelegramConnectionCode(body: Record<string, unknown>): string {
  const message = body.message as Record<string, unknown> | undefined;
  const text = String(body.text || message?.text || '').trim();
  const match = text.match(/^\/kb\s+conectar\s+([a-z0-9-]{4,20})$/i);
  return match?.[1]?.trim().toUpperCase() || '';
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
  ) {}

  private environment() {
    return this.environmentProvider.read();
  }

  async connect(input: { userId: string; workspaceSlug: string; provider: string; returnToPath?: string; browserOrigin?: string }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    if (input.provider === IntegrationProvider.GithubApp) return this.startGithubConnection(input.userId, workspace.workspaceSlug, input.returnToPath, input.browserOrigin);
    if (input.provider === IntegrationProvider.Whatsapp) return this.startWhatsappConnection(input.userId, workspace.workspaceSlug);
    if (input.provider === IntegrationProvider.Telegram) return this.startTelegramConnection(input.userId, workspace.workspaceSlug);
    if (input.provider === IntegrationProvider.AiReview || input.provider === IntegrationProvider.AiConversation) return this.activateAi(input.userId, workspace.workspaceSlug, input.provider);
    throw new NotFoundException('provider_not_found');
  }

  async session(input: { userId: string; provider: string; sessionId: string }) {
    const session = await this.sessions.findConnectionSession(input.sessionId);
    if (!session || session.provider !== input.provider || session.userId !== input.userId) throw new NotFoundException('connection_session_not_found');
    return { ok: true as const, session: publicSession(session) };
  }

  async completeGithub(input: { userId: string; state: string; installationId: string }) {
    const session = await this.sessions.findActiveConnectionSessionByState(IntegrationProvider.GithubApp, sha256(input.state), new Date().toISOString());
    if (!session || session.userId !== input.userId) throw new UnauthorizedException('invalid_connection_state');
    const installationId = extractGithubInstallationId(input.installationId);

    try {
      const installation = await this.verifyGithubInstallation(installationId);
      const accountLogin = this.normalizeGithubAccountLogin(installation);
      await this.assertExternalIdentityAvailable(ExternalIdentityProvider.GithubApp, 'installation_id', installationId, input.userId);
      const credential = await this.upsertConnectedCredential({
        userId: input.userId,
        workspaceSlug: session.workspaceSlug,
        provider: IntegrationProvider.GithubApp,
        encryptedConfig: { installationId, accountLogin },
        publicMetadata: {
          label: accountLogin ? `GitHub ${accountLogin}` : 'GitHub App',
          connectedAccount: this.connectedAccount(accountLogin, installationId),
        },
      });
      await this.upsertExternalIdentity({
        userId: input.userId,
        workspaceSlug: session.workspaceSlug,
        provider: ExternalIdentityProvider.GithubApp,
        identityType: 'installation_id',
        externalId: installationId,
        credentialId: credential.id,
        publicMetadata: { accountLogin },
      });
      const consumed = await this.consumeSessionAsConnected(session.id, { installationId, connectedAccount: this.connectedAccount(accountLogin, installationId) });
      const finalSession = consumed || session;
      return {
        ok: true as const,
        provider: IntegrationProvider.GithubApp,
        session: publicSession(finalSession),
        connectedAccount: this.connectedAccount(accountLogin, installationId),
        redirectUrl: this.buildGithubCallbackRedirect(finalSession, 'connected'),
      };
    } catch (error) {
      await this.sessions.consumeConnectionSession(session.id, 'error', { lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async completeGithubForBrowser(input: { userId: string; state: string; installationId: string }) {
    const session = await this.sessions.findActiveConnectionSessionByState(IntegrationProvider.GithubApp, sha256(input.state), new Date().toISOString());
    const redirectFromSession = session ? this.buildGithubCallbackRedirect(session, 'error') : this.fallbackGithubCallbackRedirect();
    try {
      const result = await this.completeGithub(input);
      return { redirectUrl: result.redirectUrl };
    } catch {
      return { redirectUrl: redirectFromSession };
    }
  }

  async completeWhatsappFromWebhook(input: { code: string; groupJid: string }) {
    return this.completeCodeBasedConnection({
      code: input.code,
      externalId: input.groupJid,
      spec: {
        provider: IntegrationProvider.Whatsapp,
        externalProvider: ExternalIdentityProvider.Whatsapp,
        identityType: 'jid',
        label: 'Grupo WhatsApp',
        externalIdKey: 'groupJid',
        workspaceBinding: 'whatsappGroupJid',
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
        identityType: 'chat_id',
        label: 'Chat Telegram',
        externalIdKey: 'chatId',
        workspaceBinding: 'telegramChatId',
      },
    });
  }

  async listGithubRepositories(input: { userId: string; workspaceSlug: string }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    const workspaceSlug = workspace.workspaceSlug;
    const repositories = await this.githubRepositoryResolution.listAccessibleRepositories({
      userId: input.userId,
      workspaceSlug,
      missingCredentialError: 'not_found',
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
      workspaceSlug,
      displayName: workspace.displayName,
      whatsappGroupJid: workspace.whatsappGroupJid,
      telegramChatId: workspace.telegramChatId,
      createdAt: workspace.createdAt,
      updatedAt: now,
    });
    const savedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId: input.userId,
      workspaceSlug,
      repositoryIds: input.repositories.map((repo) => repo.id),
      missingCredentialError: 'not_found',
    });

    const projects = await Promise.all(savedRepositories.map((repo) => {
      const projectSlug = slugify(repo.fullName.split('/').pop() || repo.fullName) || 'inbox';
      return this.content.upsertProject(input.userId, {
        projectSlug,
        displayName: repo.fullName,
        workspaceSlug,
        repositories: [repo],
        defaultTags: [],
        enabled: true,
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
        label: 'Conectar GitHub',
        url: appendQuery(normalizeGithubAppInstallUrl(environment.githubAppInstallUrl), { state }),
      },
      steps: ['Instale o GitHub App nos repositorios desejados.', 'Aguarde o retorno para concluir o vinculo.'],
    };
  }

  private async startWhatsappConnection(userId: string, workspaceSlug: string) {
    return this.startCodeBasedConnection({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Whatsapp,
      label: 'Conectar WhatsApp',
      steps: ['Envie a mensagem no grupo do WhatsApp.', 'Mantenha esta janela aberta ate o grupo aparecer como conectado.'],
    });
  }

  private async startTelegramConnection(userId: string, workspaceSlug: string) {
    const environment = this.environment();
    if (!environment.telegramBotToken) throw new BadRequestException('telegram_bot_token_not_configured');
    return this.startCodeBasedConnection({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Telegram,
      label: 'Conectar Telegram',
      steps: ['Envie a mensagem no chat do Telegram.', 'Mantenha esta janela aberta ate o chat aparecer como conectado.'],
    });
  }

  private async activateAi(userId: string, workspaceSlug: string, provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation) {
    const environment = this.environment();
    const review = provider === IntegrationProvider.AiReview;
    const configured = review
      ? environment.reviewAiProvider !== 'none' && environment.reviewAiBaseUrl && environment.reviewAiModel && environment.reviewAiApiKey
      : environment.conversationAiProvider !== 'none' && environment.conversationAiBaseUrl && environment.conversationAiModel && environment.conversationAiApiKey;
    if (!configured) throw new BadRequestException(review ? 'review_ai_not_configured' : 'conversation_ai_not_configured');
    const runtimeProvider = review ? environment.reviewAiProvider : environment.conversationAiProvider;
    const credential = await this.credentials.upsertCredential({
      userId,
      workspaceSlug,
      provider,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ enabled: true }, this.environmentProvider),
      publicMetadata: {
        label: review ? 'IA de Review' : 'IA de Conversa',
        connectedAccount: runtimeProvider,
      },
    });
    return {
      ok: true as const,
      provider,
      integration: {
        provider,
        status: credential.status,
        connectedAccount: runtimeProvider,
        updatedAt: credential.updatedAt,
      },
      steps: ['Recurso ativo para este workspace.'],
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
      instruction: `/kb conectar ${verificationCode}`,
      steps: input.steps,
    };
  }

  private async completeCodeBasedConnection(input: { code: string; externalId: string; spec: CodeBasedConnectionSpec }) {
    const externalId = normalizeTrimmedValue(input.externalId);
    if (!externalId) throw new UnauthorizedException('missing_external_identity');
    const session = await this.requireCodeSession(input.spec.provider, input.code);
    await this.assertExternalIdentityAvailable(input.spec.externalProvider, input.spec.identityType, externalId, session.userId);
    const credential = await this.upsertConnectedCredential({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: input.spec.provider,
      encryptedConfig: { [input.spec.externalIdKey]: externalId },
      publicMetadata: {
        label: input.spec.label,
        connectedAccount: externalId,
      },
    });
    await this.upsertExternalIdentity({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: input.spec.externalProvider,
      identityType: input.spec.identityType,
      externalId,
      credentialId: credential.id,
      publicMetadata: { [input.spec.externalIdKey]: externalId },
    });
    await this.upsertWorkspaceBinding(session.userId, session.workspaceSlug, input.spec.workspaceBinding, externalId);
    const consumed = await this.consumeSessionAsConnected(session.id, { connectedAccount: externalId });
    return {
      ok: true as const,
      provider: input.spec.provider,
      resolvedUserId: session.userId,
      workspaceSlug: session.workspaceSlug,
      session: publicSession(consumed || session),
    };
  }

  private async requireCodeSession(provider: CodeBasedProvider, code: string) {
    const normalizedCode = normalizeTrimmedValue(code).toUpperCase();
    if (!normalizedCode) throw new NotFoundException('connection_session_not_found');
    const session = await this.sessions.findActiveConnectionSessionByCode(provider, sha256(normalizedCode), new Date().toISOString());
    if (!session) throw new NotFoundException('connection_session_not_found');
    return session;
  }

  private async assertExternalIdentityAvailable(provider: string, identityType: string, externalId: string, userId: string) {
    const existing = await this.externalIdentities.findExternalIdentity(provider, identityType, externalId);
    if (existing && existing.userId !== userId) throw new ConflictException('external_identity_already_bound');
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

  private connectedAccount(preferred: string, fallback: string) {
    return preferred || fallback;
  }

  private async upsertWorkspaceBinding(
    userId: string,
    workspaceSlug: string,
    field: 'whatsappGroupJid' | 'telegramChatId',
    value: string,
  ) {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = await this.requireWorkspace(userId, workspaceSlug);
    await this.content.upsertWorkspace(userId, { ...workspace, [field]: value, updatedAt: now });
  }

  private async requireWorkspace(userId: string, workspaceSlug: string) {
    const normalized = normalizeWorkspaceSlug(workspaceSlug);
    if (!normalized) throw new BadRequestException('workspace_slug_required');
    const workspace = (await this.content.listWorkspaces(userId)).find((item) => item.workspaceSlug === normalized);
    if (!workspace) throw new NotFoundException('workspace_not_found');
    return workspace;
  }

  private buildGithubCallbackRedirect(session: IntegrationConnectionSessionRecord, status: 'connected' | 'error') {
    const environment = this.environment();
    const metadata = session.metadata as ConnectionSessionMetadata;
    const origin = normalizeBrowserOrigin(metadata.browserOrigin) || environment.publicBaseUrl || '';
    const returnToPath = normalizeReturnToPath(metadata.returnToPath, '/settings/integrations');
    const base = buildBrowserRedirectUrl(origin || environment.publicBaseUrl || '', returnToPath);
    base.searchParams.set('integration', IntegrationProvider.GithubApp);
    base.searchParams.set('status', status);
    base.searchParams.set('workspaceSlug', session.workspaceSlug);
    return origin ? base.toString() : `${base.pathname}${base.search}${base.hash}`;
  }

  private fallbackGithubCallbackRedirect() {
    const environment = this.environment();
    const origin = environment.publicBaseUrl || '';
    const base = buildBrowserRedirectUrl(origin, '/settings/integrations');
    base.searchParams.set('integration', IntegrationProvider.GithubApp);
    base.searchParams.set('status', 'error');
    return origin ? base.toString() : `${base.pathname}${base.search}`;
  }
}
