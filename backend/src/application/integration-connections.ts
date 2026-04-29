import crypto from 'node:crypto';

import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { readEnvironment } from '../adapters/environment.js';
import { fetchGithubInstallationRepositories } from '../adapters/github.js';
import { CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider } from '../contracts/enums.js';
import { slugify } from '../domain/strings.js';
import { decryptConfig, encryptConfig } from './credentials.js';
import type { IntegrationConnectionSessionRecord, WorkspaceRecord } from './models/repository-records.models.js';
import { ContentRepository } from './ports/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository, IntegrationConnectionSessionRepository } from './ports/integrations.repository.js';

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

function extractGithubInstallationId(value: unknown): string {
  return String(value || '').trim();
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
  const data = body.data as Record<string, unknown> | undefined;
  const message = data?.message as Record<string, unknown> | undefined;
  const text = String(
    body.text ||
      body.message ||
      body.body ||
      data?.text ||
      data?.body ||
      message?.conversation ||
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
  ) {}

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

  async completeGithub(input: { userId: string; state: string; code: string; installationId: string }) {
    const session = await this.sessions.findActiveConnectionSessionByState(IntegrationProvider.GithubApp, sha256(input.state), new Date().toISOString());
    if (!session || session.userId !== input.userId) throw new UnauthorizedException('invalid_connection_state');
    const installationId = extractGithubInstallationId(input.installationId);
    if (!input.code || !installationId) throw new BadRequestException('github_callback_missing_code_or_installation');

    try {
      const installation = await this.verifyGithubInstallation(input.code, installationId);
      const accountLogin = String(installation.account?.login || '').trim();
      const existing = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.GithubApp, 'installation_id', installationId);
      if (existing && existing.userId !== input.userId) throw new ConflictException('external_identity_already_bound');
      const credential = await this.credentials.upsertCredential({
        userId: input.userId,
        workspaceSlug: session.workspaceSlug,
        provider: IntegrationProvider.GithubApp,
        status: CredentialRecordStatus.Connected,
        encryptedConfig: encryptConfig({ installationId, accountLogin }),
        publicMetadata: {
          label: accountLogin ? `GitHub ${accountLogin}` : 'GitHub App',
          connectedAccount: accountLogin || installationId,
        },
      });
      await this.externalIdentities.upsertExternalIdentity({
        userId: input.userId,
        workspaceSlug: session.workspaceSlug,
        provider: ExternalIdentityProvider.GithubApp,
        identityType: 'installation_id',
        externalId: installationId,
        credentialId: credential.id,
        metadata: {},
        publicMetadata: { accountLogin },
      });
      const consumed = await this.sessions.consumeConnectionSession(session.id, CONNECTED_STATUS, { installationId, connectedAccount: accountLogin || installationId });
      const finalSession = consumed || session;
      return {
        ok: true as const,
        provider: IntegrationProvider.GithubApp,
        session: publicSession(finalSession),
        connectedAccount: accountLogin || installationId,
        redirectUrl: this.buildGithubCallbackRedirect(finalSession, 'connected'),
      };
    } catch (error) {
      await this.sessions.consumeConnectionSession(session.id, 'error', { lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async completeGithubForBrowser(input: { userId: string; state: string; code: string; installationId: string }) {
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
    const groupJid = input.groupJid.trim();
    if (!groupJid) throw new UnauthorizedException('missing_external_identity');
    const session = await this.sessions.findActiveConnectionSessionByCode(IntegrationProvider.Whatsapp, sha256(input.code.trim().toUpperCase()), new Date().toISOString());
    if (!session) throw new NotFoundException('connection_session_not_found');
    const existing = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.Whatsapp, 'jid', groupJid);
    if (existing && existing.userId !== session.userId) throw new ConflictException('external_identity_already_bound');
    const credential = await this.credentials.upsertCredential({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: IntegrationProvider.Whatsapp,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ groupJid }),
      publicMetadata: {
        label: 'Grupo WhatsApp',
        connectedAccount: groupJid,
      },
    });
    await this.externalIdentities.upsertExternalIdentity({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: ExternalIdentityProvider.Whatsapp,
      identityType: 'jid',
      externalId: groupJid,
      credentialId: credential.id,
      metadata: {},
      publicMetadata: { groupJid },
    });
    await this.upsertWorkspaceWhatsappGroup(session.userId, session.workspaceSlug, groupJid);
    const consumed = await this.sessions.consumeConnectionSession(session.id, CONNECTED_STATUS, { connectedAccount: groupJid });
    return { ok: true as const, provider: IntegrationProvider.Whatsapp, resolvedUserId: session.userId, workspaceSlug: session.workspaceSlug, session: publicSession(consumed || session) };
  }

  async completeTelegramFromWebhook(input: { code: string; chatId: string }) {
    const chatId = input.chatId.trim();
    if (!chatId) throw new UnauthorizedException('missing_external_identity');
    const session = await this.sessions.findActiveConnectionSessionByCode(IntegrationProvider.Telegram, sha256(input.code.trim().toUpperCase()), new Date().toISOString());
    if (!session) throw new NotFoundException('connection_session_not_found');
    const existing = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.Telegram, 'chat_id', chatId);
    if (existing && existing.userId !== session.userId) throw new ConflictException('external_identity_already_bound');
    const credential = await this.credentials.upsertCredential({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: IntegrationProvider.Telegram,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ chatId }),
      publicMetadata: {
        label: 'Chat Telegram',
        connectedAccount: chatId,
      },
    });
    await this.externalIdentities.upsertExternalIdentity({
      userId: session.userId,
      workspaceSlug: session.workspaceSlug,
      provider: ExternalIdentityProvider.Telegram,
      identityType: 'chat_id',
      externalId: chatId,
      credentialId: credential.id,
      metadata: {},
      publicMetadata: { chatId },
    });
    await this.upsertWorkspaceTelegramChat(session.userId, session.workspaceSlug, chatId);
    const consumed = await this.sessions.consumeConnectionSession(session.id, CONNECTED_STATUS, { connectedAccount: chatId });
    return { ok: true as const, provider: IntegrationProvider.Telegram, resolvedUserId: session.userId, workspaceSlug: session.workspaceSlug, session: publicSession(consumed || session) };
  }

  async listGithubRepositories(input: { userId: string; workspaceSlug: string }) {
    const workspace = await this.requireWorkspace(input.userId, input.workspaceSlug);
    const workspaceSlug = workspace.workspaceSlug;
    const credential = await this.credentials.findCredential(input.userId, workspaceSlug, IntegrationProvider.GithubApp);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) throw new NotFoundException('credential_not_found');
    const config = decryptConfig(credential.encryptedConfig);
    const installationId = String(config.installationId || '').trim();
    const environment = readEnvironment();
    if (!environment.githubAppId || !environment.githubAppPrivateKey || !installationId) throw new BadRequestException('github_app_installation_not_configured');
    const repositories = await fetchGithubInstallationRepositories({
      appId: environment.githubAppId,
      privateKey: environment.githubAppPrivateKey,
      installationId,
    });
    const selected = new Set(workspace.githubRepos || []);
    return {
      ok: true as const,
      workspaceSlug,
      repositories: repositories.map((repository) => ({
        ...repository,
        selected: selected.has(repository.fullName),
      })),
    };
  }

  async saveGithubRepositories(input: { userId: string; workspaceSlug: string; repositories: string[] }) {
    const existing = await this.requireWorkspace(input.userId, input.workspaceSlug);
    const workspaceSlug = existing.workspaceSlug;
    const credential = await this.credentials.findCredential(input.userId, workspaceSlug, IntegrationProvider.GithubApp);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) throw new NotFoundException('credential_not_found');
    const selectedRepos = Array.from(new Set(input.repositories.map((repo) => String(repo || '').trim()).filter(Boolean)));
    const now = new Date().toISOString();
    const projectSlugs = Array.from(new Set([...(existing?.projectSlugs || []), ...selectedRepos.map((repo) => slugify(repo.split('/').pop() || repo) || 'inbox')]));
    await this.content.upsertWorkspace(input.userId, {
      workspaceSlug,
      displayName: existing?.displayName || workspaceSlug,
      whatsappGroupJid: existing?.whatsappGroupJid || '',
      telegramChatId: existing?.telegramChatId || '',
      githubRepos: selectedRepos,
      projectSlugs,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    const projects = await Promise.all(selectedRepos.map((repoFullName) => {
      const projectSlug = slugify(repoFullName.split('/').pop() || repoFullName) || 'inbox';
      return this.content.upsertProject(input.userId, {
        projectSlug,
        displayName: repoFullName,
        repoFullName,
        workspaceSlug,
        aliases: [],
        defaultTags: [],
        enabled: true,
      });
    }));
    return { ok: true as const, workspaceSlug, repositories: selectedRepos, projects };
  }

  private async startGithubConnection(userId: string, workspaceSlug: string, returnToPath?: string, browserOrigin?: string) {
    const environment = readEnvironment();
    if (!environment.githubAppInstallUrl) throw new BadRequestException('github_app_install_url_not_configured');
    const state = randomState();
    const session = await this.sessions.createConnectionSession({
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
      expiresAt: expiresAt(),
    });
    return {
      ok: true as const,
      provider: IntegrationProvider.GithubApp,
      session: publicSession(session),
      primaryAction: {
        type: 'external_redirect',
        label: 'Conectar GitHub',
        url: appendQuery(environment.githubAppInstallUrl, { state }),
      },
      steps: ['Autorize o GitHub App.', 'Aguarde o retorno para concluir o vinculo.'],
    };
  }

  private async startWhatsappConnection(userId: string, workspaceSlug: string) {
    const environment = readEnvironment();
    const verificationCode = randomVerificationCode();
    const session = await this.sessions.createConnectionSession({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Whatsapp,
      stateHash: '',
      verificationCodeHash: sha256(verificationCode),
      status: PENDING_STATUS,
      metadata: {},
      expiresAt: expiresAt(),
    });
    return {
      ok: true as const,
      provider: IntegrationProvider.Whatsapp,
      session: publicSession(session),
      primaryAction: {
        type: 'open_modal',
        label: 'Conectar WhatsApp',
      },
      verificationCode,
      pairingUrl: environment.whatsappPairingUrl || environment.evolutionApiPublicUrl || '',
      instruction: `/kb conectar ${verificationCode}`,
      steps: ['Envie a mensagem no grupo do WhatsApp.', 'Mantenha esta janela aberta ate o grupo aparecer como conectado.'],
    };
  }

  private async startTelegramConnection(userId: string, workspaceSlug: string) {
    const environment = readEnvironment();
    if (!environment.telegramBotToken) throw new BadRequestException('telegram_bot_token_not_configured');
    const verificationCode = randomVerificationCode();
    const session = await this.sessions.createConnectionSession({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.Telegram,
      stateHash: '',
      verificationCodeHash: sha256(verificationCode),
      status: PENDING_STATUS,
      metadata: {},
      expiresAt: expiresAt(),
    });
    return {
      ok: true as const,
      provider: IntegrationProvider.Telegram,
      session: publicSession(session),
      primaryAction: {
        type: 'open_modal',
        label: 'Conectar Telegram',
      },
      verificationCode,
      instruction: `/kb conectar ${verificationCode}`,
      steps: ['Envie a mensagem no chat do Telegram.', 'Mantenha esta janela aberta ate o chat aparecer como conectado.'],
    };
  }

  private async activateAi(userId: string, workspaceSlug: string, provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation) {
    const environment = readEnvironment();
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
      encryptedConfig: encryptConfig({ enabled: true }),
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

  private async verifyGithubInstallation(code: string, installationId: string): Promise<GithubInstallation> {
    const environment = readEnvironment();
    if (!environment.githubAppClientId || !environment.githubAppClientSecret) throw new BadRequestException('github_app_oauth_not_configured');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: environment.githubAppClientId,
        client_secret: environment.githubAppClientSecret,
        code,
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('github_oauth_exchange_failed');
    const tokenPayload = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenPayload.access_token || tokenPayload.error) throw new UnauthorizedException('github_oauth_exchange_failed');
    const installationsResponse = await fetch('https://api.github.com/user/installations', {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${tokenPayload.access_token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!installationsResponse.ok) throw new UnauthorizedException('github_installation_validation_failed');
    const payload = await installationsResponse.json() as { installations?: GithubInstallation[] };
    const installation = (payload.installations || []).find((candidate) => String(candidate.id || '') === installationId);
    if (!installation) throw new UnauthorizedException('github_installation_not_accessible');
    return installation;
  }

  private async upsertWorkspaceWhatsappGroup(userId: string, workspaceSlug: string, groupJid: string) {
    const now = new Date().toISOString();
    const existing = await this.requireWorkspace(userId, workspaceSlug);
    const workspace: WorkspaceRecord = existing;
    await this.content.upsertWorkspace(userId, { ...workspace, whatsappGroupJid: groupJid, updatedAt: now });
  }

  private async upsertWorkspaceTelegramChat(userId: string, workspaceSlug: string, chatId: string) {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = await this.requireWorkspace(userId, workspaceSlug);
    await this.content.upsertWorkspace(userId, { ...workspace, telegramChatId: chatId, updatedAt: now });
  }

  private async requireWorkspace(userId: string, workspaceSlug: string) {
    const normalized = normalizeWorkspaceSlug(workspaceSlug);
    if (!normalized) throw new BadRequestException('workspace_slug_required');
    const workspace = (await this.content.listWorkspaces(userId)).find((item) => item.workspaceSlug === normalized);
    if (!workspace) throw new NotFoundException('workspace_not_found');
    return workspace;
  }

  private buildGithubCallbackRedirect(session: IntegrationConnectionSessionRecord, status: 'connected' | 'error') {
    const environment = readEnvironment();
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
    const environment = readEnvironment();
    const origin = environment.publicBaseUrl || '';
    const base = buildBrowserRedirectUrl(origin, '/settings/integrations');
    base.searchParams.set('integration', IntegrationProvider.GithubApp);
    base.searchParams.set('status', 'error');
    return origin ? base.toString() : `${base.pathname}${base.search}`;
  }
}
