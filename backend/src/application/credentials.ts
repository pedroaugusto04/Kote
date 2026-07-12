import crypto from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  CredentialRecordStatus,
  ExternalIdentityProvider,
  IntegrationProvider,
  StoredIntegrationStatus,
  IntegrationActionType,
} from '../contracts/enums.js';
import type { IntegrationCredentialRecord } from './models/repository-records.models.js';
import { ContentRepository } from './ports/notes/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository } from './ports/integrations/integrations.repository.js';
import { PushSubscriptionRepository } from './ports/push/push-subscription.repository.js';
import { RuntimeEnvironmentProvider } from './ports/observability/runtime-environment.port.js';
import { getAiProviderConfig, AI_PROVIDERS_REGISTRY } from './ai-providers-registry.js';

export { IntegrationProvider };
export const guidedProviders = [
  IntegrationProvider.GithubApp,
  IntegrationProvider.Whatsapp,
  IntegrationProvider.Telegram,
  IntegrationProvider.AiReview,
  IntegrationProvider.AiConversation,
  IntegrationProvider.ProjectBriefAi,
  IntegrationProvider.PrContextAi,
  IntegrationProvider.FileNotesSummaryAi,
  IntegrationProvider.PushNotifications,
] as const;
type GuidedIntegrationProvider = typeof guidedProviders[number];

export type EncryptedConfig = {
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: number;
};

export type StoredIntegration = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  status: StoredIntegrationStatus;
  workspaceSlug: string;
  publicMetadata: Record<string, unknown>;
  primaryAction: { type: IntegrationActionType; label: string } | null;
  steps: string[];
  lastError: string | null;
  connectedAccount: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
};

const providerLabels: Record<GuidedIntegrationProvider, { name: string; description: string }> = {
  [IntegrationProvider.GithubApp]: { name: 'GitHub App', description: 'User-linked installation for push reviews and repository selection.' },
  [IntegrationProvider.Whatsapp]: { name: 'WhatsApp', description: 'Authorized chat for capture and conversation through the managed transport.' },
  [IntegrationProvider.Telegram]: { name: 'Telegram', description: 'Chat linked to the managed bot for notifications and commands.' },
  [IntegrationProvider.AiReview]: { name: 'Review AI', description: 'Push analysis with a server-managed provider and model.' },
  [IntegrationProvider.AiConversation]: { name: 'Conversation AI', description: 'Assisted extraction from chat messages with managed configuration.' },
  [IntegrationProvider.ProjectBriefAi]: { name: 'Project Brief AI', description: 'Manual operational project brief generation with managed configuration.' },
  [IntegrationProvider.PrContextAi]: { name: 'PR Context AI', description: 'Automatic Pull Request memory and context retrieval with managed configuration.' },
  [IntegrationProvider.FileNotesSummaryAi]: { name: 'File Notes Summary AI', description: 'Server-managed provider and model for AI-powered file notes summary in VS Code.' },
  [IntegrationProvider.PushNotifications]: { name: 'Push Notifications', description: 'Receive browser push notifications for reminders and updates.' },
};

function isGuidedProvider(value: string): value is GuidedIntegrationProvider {
  return guidedProviders.includes(value as GuidedIntegrationProvider);
}

function encryptionKey(environmentProvider: RuntimeEnvironmentProvider): Buffer {
  const key = Buffer.from(environmentProvider.read().credentialsEncryptionKey, 'base64');
  if (key.length !== 32) throw new Error('credentials_encryption_key_must_be_32_bytes_base64');
  return key;
}

export function encryptConfig(config: Record<string, unknown>, environmentProvider: RuntimeEnvironmentProvider): EncryptedConfig {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(environmentProvider), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    keyVersion: 1,
  };
}

export function decryptConfig(encrypted: unknown, environmentProvider: RuntimeEnvironmentProvider): Record<string, unknown> {
  const payload = encrypted as EncryptedConfig;
  if (!payload?.iv || !payload.authTag || !payload.ciphertext) throw new Error('invalid_encrypted_config');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(environmentProvider), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const cleartext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(cleartext) as Record<string, unknown>;
}

function publicCredential(record: IntegrationCredentialRecord | null, provider: GuidedIntegrationProvider, workspaceSlug: string): StoredIntegration {
  const label = providerLabels[provider];
  const isAiProvider = provider.startsWith('ai-') || provider.endsWith('-ai');
  const connectAction = { type: IntegrationActionType.Connect, label: provider === IntegrationProvider.GithubApp ? 'Connect GitHub' : isAiProvider ? 'Enable' : `Connect ${label.name}` };
  if (!record) {
    if (isAiProvider) {
      return {
        provider,
        name: label.name,
        description: label.description,
        status: StoredIntegrationStatus.Connected,
        workspaceSlug,
        publicMetadata: {},
        primaryAction: { type: IntegrationActionType.Revoke, label: 'Disable' },
        steps: connectedSteps(provider),
        lastError: null,
        connectedAccount: null,
        updatedAt: null,
        revokedAt: null,
      };
    }
    return {
      provider,
      name: label.name,
      description: label.description,
      status: StoredIntegrationStatus.Missing,
      workspaceSlug,
      publicMetadata: {},
      primaryAction: connectAction,
      steps: defaultSteps(provider),
      lastError: null,
      connectedAccount: null,
      updatedAt: null,
      revokedAt: null,
    };
  }
  const connected = record.status === CredentialRecordStatus.Connected && !record.revokedAt;

  return {
    provider,
    name: label.name,
    description: label.description,
    status: connected ? StoredIntegrationStatus.Connected : StoredIntegrationStatus.Revoked,
    workspaceSlug,
    publicMetadata: record.publicMetadata,
    primaryAction: connected ? { type: IntegrationActionType.Revoke, label: isAiProvider ? 'Disable' : 'Revoke' } : connectAction,
    steps: connected ? connectedSteps(provider) : ['Credential revoked.', isAiProvider ? 'Enable it again to restore access.' : 'Connect again to reactivate it.'],
    lastError: typeof record.publicMetadata.lastError === 'string' ? record.publicMetadata.lastError : null,
    connectedAccount: typeof record.publicMetadata.connectedAccount === 'string' ? record.publicMetadata.connectedAccount : null,
    updatedAt: record.updatedAt,
    revokedAt: record.revokedAt,
  };
}

function defaultIdentityType(provider: string): string {
  if (provider === ExternalIdentityProvider.Telegram) return 'chat_id';
  if (provider === ExternalIdentityProvider.Whatsapp) return 'jid';
  if (provider === ExternalIdentityProvider.GithubApp) return 'installation_id';
  return 'external_id';
}

function externalIdentityProviderForIntegration(provider: GuidedIntegrationProvider): ExternalIdentityProvider | null {
  if (provider === IntegrationProvider.Telegram) return ExternalIdentityProvider.Telegram;
  if (provider === IntegrationProvider.Whatsapp) return ExternalIdentityProvider.Whatsapp;
  if (provider === IntegrationProvider.GithubApp) return ExternalIdentityProvider.GithubApp;
  return null;
}

function defaultSteps(provider: GuidedIntegrationProvider): string[] {
  if (provider === IntegrationProvider.Whatsapp) return ['Start the connection.', 'Send the code in the WhatsApp chat.'];
  if (provider === IntegrationProvider.Telegram) return ['Start the connection.', 'Send the code in the Telegram chat.'];
  if (provider === IntegrationProvider.GithubApp) return ['Install or authorize the GitHub App.', 'Select the repositories after connection.'];
  if (provider === IntegrationProvider.PushNotifications) return ['Allow browser notifications.', 'Get push reminders directly in your browser.'];
  return ['Enable the feature.', 'The server-managed configuration will be used automatically.'];
}

function connectedSteps(provider: GuidedIntegrationProvider): string[] {
  if (provider === IntegrationProvider.GithubApp) return ['GitHub App connected.', 'Select the workspace repositories.'];
  if (provider === IntegrationProvider.Telegram) return ['Telegram chat connected.'];
  if (provider === IntegrationProvider.PushNotifications) return ['Push notifications are active on this browser/device.'];
  if (provider.startsWith('ai-') || provider.endsWith('-ai')) return ['Feature active for this workspace.'];
  return ['Integration connected.'];
}

function aiEnvStatus(provider: string, environmentProvider: RuntimeEnvironmentProvider) {
  const environment = environmentProvider.read();
  const aiProvider = provider as keyof typeof AI_PROVIDERS_REGISTRY;
  if (!(aiProvider in AI_PROVIDERS_REGISTRY)) {
    return { configured: false, missing: ['provider'], provider: 'none' };
  }
  const config = getAiProviderConfig(aiProvider, environment);
  const missing = [
    config.provider === 'none' ? 'provider' : '',
    !config.baseUrl ? 'baseUrl' : '',
    !config.model ? 'model' : '',
    !config.apiKey ? 'apiKey' : '',
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    provider: config.provider,
  };
}

@Injectable()
export class IntegrationCredentialService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly contentRepository?: ContentRepository,
    private readonly pushSubscriptionRepository?: PushSubscriptionRepository,
  ) {}

  async list(userId: string, workspaceSlug = 'default') {
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    const [records, pushSubs] = await Promise.all([
      this.credentials.listCredentials(userId, workspaceSlug),
      this.pushSubscriptionRepository
        ? this.pushSubscriptionRepository.listByUserId(userId)
        : Promise.resolve([]),
    ]);
    const integrations = guidedProviders.map((provider) => {
      if (provider === IntegrationProvider.PushNotifications) {
        const hasSub = pushSubs.length > 0;
        return {
          provider,
          name: providerLabels[provider].name,
          description: providerLabels[provider].description,
          status: hasSub ? StoredIntegrationStatus.Connected : StoredIntegrationStatus.Missing,
          workspaceSlug,
          publicMetadata: {},
          primaryAction: { type: 'connect' as const, label: hasSub ? 'Disable' : 'Enable' },
          steps: hasSub ? connectedSteps(provider) : defaultSteps(provider),
          lastError: null,
          connectedAccount: null,
          updatedAt: null,
          revokedAt: null,
        };
      }
      return publicCredential(records.find((record) => record.provider === provider) || null, provider, workspaceSlug);
    });
    return {
      ok: true as const,
      workspaceSlug,
      integrations,
      githubBackfillLimit: this.environmentProvider.read().githubBackfillLimit,
    };
  }

  async revoke(userId: string, workspaceSlug: string, provider: string) {
    if (!isGuidedProvider(provider)) throw new NotFoundException('provider_not_found');
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    if (provider === IntegrationProvider.PushNotifications) {
      if (this.pushSubscriptionRepository) {
        const subs = await this.pushSubscriptionRepository.listByUserId(userId);
        for (const sub of subs) {
          await this.pushSubscriptionRepository.deleteByEndpoint(userId, sub.endpoint);
        }
      }
      return {
        ok: true as const,
        integration: {
          provider: IntegrationProvider.PushNotifications,
          name: providerLabels[IntegrationProvider.PushNotifications].name,
          description: providerLabels[IntegrationProvider.PushNotifications].description,
          status: StoredIntegrationStatus.Revoked,
          workspaceSlug,
          publicMetadata: {},
          primaryAction: { type: 'connect' as const, label: 'Enable' },
          steps: defaultSteps(IntegrationProvider.PushNotifications),
          lastError: null,
          connectedAccount: null,
          updatedAt: null,
          revokedAt: new Date().toISOString(),
        },
      };
    }
    if (provider === IntegrationProvider.Telegram || provider === IntegrationProvider.Whatsapp) {
      await this.clearWorkspaceBinding(userId, workspaceSlug, provider);
    }
    const identityProvider = externalIdentityProviderForIntegration(provider);
    if (identityProvider) {
      await this.externalIdentities.deleteExternalIdentities({
        userId,
        workspaceSlug,
        provider: identityProvider,
      });
    }
    const record = await this.credentials.revokeCredential(userId, workspaceSlug, provider, encryptConfig({ revoked: true }, this.environmentProvider));
    return { ok: true as const, integration: publicCredential(record, provider, workspaceSlug) };
  }

  async test(userId: string, workspaceSlug: string, provider: string) {
    if (
      provider !== IntegrationProvider.AiReview &&
      provider !== IntegrationProvider.AiConversation &&
      provider !== IntegrationProvider.ProjectBriefAi &&
      provider !== IntegrationProvider.PrContextAi &&
      provider !== IntegrationProvider.FileNotesSummaryAi
    ) throw new NotFoundException('provider_not_found');
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    const status = aiEnvStatus(provider, this.environmentProvider);
    const record = await this.credentials.findCredential(userId, workspaceSlug, provider);
    const active = Boolean(record && record.status === CredentialRecordStatus.Connected && !record.revokedAt);
    return {
      ok: true as const,
      provider,
      active,
      configured: status.configured,
      missing: status.missing,
      message: !active
        ? 'Feature disabled in this workspace.'
        : status.configured
          ? 'Managed configuration is ready.'
          : 'Managed configuration is incomplete.',
    };
  }

  async resolve(input: {
    provider: string;
    workspaceSlug?: string;
    userId?: string;
    externalIdentity?: { provider: string; identityType?: string; externalId: string };
  }) {
    if (!isGuidedProvider(input.provider)) throw new NotFoundException('provider_not_found');
    const userId = await this.resolveUserId(input.userId, input.externalIdentity);
    const record = await this.credentials.findCredential(userId, input.workspaceSlug || 'default', input.provider);
    if (!record || record.status !== CredentialRecordStatus.Connected || record.revokedAt) throw new NotFoundException('credential_not_found');
    return {
      ok: true as const,
      userId,
      workspaceSlug: record.workspaceSlug,
      provider: input.provider,
      config: decryptConfig(record.encryptedConfig, this.environmentProvider),
      publicMetadata: record.publicMetadata,
    };
  }

  private async resolveUserId(
    userId: string | undefined,
    externalIdentity: { provider: string; identityType?: string; externalId: string } | undefined,
  ) {
    if (userId) return userId;
    if (!externalIdentity) throw new NotFoundException('identity_not_found');
    const identityType = externalIdentity.identityType || defaultIdentityType(externalIdentity.provider);
    const identity = await this.externalIdentities.findExternalIdentity(externalIdentity.provider, identityType, externalIdentity.externalId);
    if (!identity) throw new NotFoundException('identity_not_found');
    return identity.userId;
  }

  private async clearWorkspaceBinding(userId: string, workspaceSlug: string, provider: IntegrationProvider.Telegram | IntegrationProvider.Whatsapp) {
    if (!this.contentRepository) return;
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces.find((item) => item.workspaceSlug === workspaceSlug);
    if (!workspace) return;
    await this.contentRepository.upsertWorkspace(userId, {
      ...workspace,
      whatsappChatJid: provider === IntegrationProvider.Whatsapp ? '' : workspace.whatsappChatJid,
      telegramChatId: provider === IntegrationProvider.Telegram ? '' : workspace.telegramChatId,
      updatedAt: new Date().toISOString(),
    });
  }
}
