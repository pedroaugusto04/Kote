import crypto from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { readEnvironment } from '../adapters/environment.js';
import {
  CredentialRecordStatus,
  ExternalIdentityProvider,
  IntegrationProvider,
  StoredIntegrationStatus,
} from '../contracts/enums.js';
import type { IntegrationCredentialRecord } from './models/repository-records.models.js';
import { CredentialRepository, ExternalIdentityRepository } from './ports/integrations.repository.js';

export { IntegrationProvider };
export const guidedProviders = [
  IntegrationProvider.GithubApp,
  IntegrationProvider.Whatsapp,
  IntegrationProvider.Telegram,
  IntegrationProvider.AiReview,
  IntegrationProvider.AiConversation,
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
  primaryAction: { type: 'connect' | 'revoke' | 'none'; label: string } | null;
  steps: string[];
  lastError: string | null;
  connectedAccount: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
};

const providerLabels: Record<GuidedIntegrationProvider, { name: string; description: string }> = {
  [IntegrationProvider.GithubApp]: { name: 'GitHub App', description: 'Instalacao vinculada ao usuario para reviews de push e selecao de repositorios.' },
  [IntegrationProvider.Whatsapp]: { name: 'WhatsApp', description: 'Grupo autorizado para captura e conversa pelo transporte gerenciado.' },
  [IntegrationProvider.Telegram]: { name: 'Telegram', description: 'Chat vinculado ao bot gerenciado para notificacoes e comandos.' },
  [IntegrationProvider.AiReview]: { name: 'IA de Review', description: 'Analise de pushes com provider e modelo configurados pelo servidor.' },
  [IntegrationProvider.AiConversation]: { name: 'IA de Conversa', description: 'Extracao assistida das mensagens de conversa com configuracao gerenciada.' },
};

function isGuidedProvider(value: string): value is GuidedIntegrationProvider {
  return guidedProviders.includes(value as GuidedIntegrationProvider);
}

function encryptionKey(): Buffer {
  const key = Buffer.from(readEnvironment().credentialsEncryptionKey, 'base64');
  if (key.length !== 32) throw new Error('credentials_encryption_key_must_be_32_bytes_base64');
  return key;
}

export function encryptConfig(config: Record<string, unknown>): EncryptedConfig {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    keyVersion: 1,
  };
}

export function decryptConfig(encrypted: unknown): Record<string, unknown> {
  const payload = encrypted as EncryptedConfig;
  if (!payload?.iv || !payload.authTag || !payload.ciphertext) throw new Error('invalid_encrypted_config');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const cleartext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(cleartext) as Record<string, unknown>;
}

function publicCredential(record: IntegrationCredentialRecord | null, provider: GuidedIntegrationProvider, workspaceSlug: string): StoredIntegration {
  const label = providerLabels[provider];
  const connectAction = { type: 'connect' as const, label: provider === IntegrationProvider.GithubApp ? 'Conectar GitHub' : provider.startsWith('ai-') ? 'Ativar' : `Conectar ${label.name}` };
  if (!record) {
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
    primaryAction: connected ? { type: 'revoke', label: provider.startsWith('ai-') ? 'Desativar' : 'Revogar' } : connectAction,
    steps: connected ? connectedSteps(provider) : ['Credencial revogada.', provider.startsWith('ai-') ? 'Ative novamente para reabilitar.' : 'Conecte novamente para reativar.'],
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

function defaultSteps(provider: GuidedIntegrationProvider): string[] {
  if (provider === IntegrationProvider.Whatsapp) return ['Inicie a conexao.', 'Envie o codigo no grupo do WhatsApp.'];
  if (provider === IntegrationProvider.Telegram) return ['Inicie a conexao.', 'Envie o codigo no chat do Telegram.'];
  if (provider === IntegrationProvider.GithubApp) return ['Instale ou autorize o GitHub App.', 'Selecione os repositorios depois da conexao.'];
  return ['Ative o recurso.', 'A configuracao gerenciada do servidor sera usada automaticamente.'];
}

function connectedSteps(provider: GuidedIntegrationProvider): string[] {
  if (provider === IntegrationProvider.GithubApp) return ['GitHub App conectado.', 'Selecione os repositorios do workspace.'];
  if (provider === IntegrationProvider.Telegram) return ['Chat do Telegram conectado.'];
  if (provider.startsWith('ai-')) return ['Recurso ativo para este workspace.'];
  return ['Integracao conectada.'];
}

function aiEnvStatus(provider: string) {
  const environment = readEnvironment();
  const review = provider === IntegrationProvider.AiReview;
  const flags = review
    ? {
        provider: environment.reviewAiProvider,
        baseUrl: environment.reviewAiBaseUrl,
        model: environment.reviewAiModel,
        apiKey: environment.reviewAiApiKey,
      }
    : {
        provider: environment.conversationAiProvider,
        baseUrl: environment.conversationAiBaseUrl,
        model: environment.conversationAiModel,
        apiKey: environment.conversationAiApiKey,
      };
  const missing = [
    flags.provider === 'none' ? 'provider' : '',
    !flags.baseUrl ? 'baseUrl' : '',
    !flags.model ? 'model' : '',
    !flags.apiKey ? 'apiKey' : '',
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    provider: flags.provider,
  };
}

@Injectable()
export class IntegrationCredentialService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly externalIdentities: ExternalIdentityRepository,
  ) {}

  async list(userId: string, workspaceSlug = 'default') {
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    const records = await this.credentials.listCredentials(userId, workspaceSlug);
    return {
      ok: true as const,
      workspaceSlug,
      integrations: guidedProviders.map((provider) => publicCredential(records.find((record) => record.provider === provider) || null, provider, workspaceSlug)),
    };
  }

  async revoke(userId: string, workspaceSlug: string, provider: string) {
    if (!isGuidedProvider(provider)) throw new NotFoundException('provider_not_found');
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    const record = await this.credentials.revokeCredential(userId, workspaceSlug, provider, encryptConfig({ revoked: true }));
    return { ok: true as const, integration: publicCredential(record, provider, workspaceSlug) };
  }

  async test(userId: string, workspaceSlug: string, provider: string) {
    if (provider !== IntegrationProvider.AiReview && provider !== IntegrationProvider.AiConversation) throw new NotFoundException('provider_not_found');
    if (!workspaceSlug) throw new BadRequestException('workspace_slug_required');
    const status = aiEnvStatus(provider);
    const record = await this.credentials.findCredential(userId, workspaceSlug, provider);
    const active = Boolean(record && record.status === CredentialRecordStatus.Connected && !record.revokedAt);
    return {
      ok: true as const,
      provider,
      active,
      configured: status.configured,
      missing: status.missing,
      message: !active
        ? 'Recurso desativado neste workspace.'
        : status.configured
          ? 'Configuracao gerenciada pronta.'
          : 'Configuracao gerenciada incompleta.',
    };
  }

  async resolve(input: {
    provider: string;
    workspaceSlug?: string;
    userId?: string;
    externalIdentity?: { provider: string; identityType?: string; externalId: string };
    authorization?: string;
  }) {
    const token = input.authorization?.startsWith('Bearer ') ? input.authorization.slice('Bearer '.length) : '';
    if (!readEnvironment().internalServiceToken || token !== readEnvironment().internalServiceToken) {
      throw new UnauthorizedException('invalid_internal_token');
    }
    if (!isGuidedProvider(input.provider)) throw new NotFoundException('provider_not_found');
    let userId = input.userId || '';
    if (!userId && input.externalIdentity) {
      const identityType = input.externalIdentity.identityType || defaultIdentityType(input.externalIdentity.provider);
      const identity = await this.externalIdentities.findExternalIdentity(input.externalIdentity.provider, identityType, input.externalIdentity.externalId);
      userId = identity?.userId || '';
    }
    if (!userId) throw new NotFoundException('identity_not_found');
    const record = await this.credentials.findCredential(userId, input.workspaceSlug || 'default', input.provider);
    if (!record || record.status !== CredentialRecordStatus.Connected || record.revokedAt) throw new NotFoundException('credential_not_found');
    return {
      ok: true as const,
      userId,
      workspaceSlug: record.workspaceSlug,
      provider: input.provider,
      config: decryptConfig(record.encryptedConfig),
      publicMetadata: record.publicMetadata,
    };
  }
}
