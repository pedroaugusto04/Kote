import { ConflictException, Injectable } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { encryptConfig } from '../../credentials.js';
import type { CreateWorkspaceInput } from '../../models/workspace-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { getAiProviderConfig } from '../../ai-providers-registry.js';
import { QuotaService } from '../../services/quota.service.js';
import { QuotaResourceType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';

import crypto from 'node:crypto';

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly runtimeEnvironmentProvider: RuntimeEnvironmentProvider,
    private readonly quotaService: QuotaService,
  ) {}

  async execute(input: CreateWorkspaceInput, userId: string) {
    const quotaResult = await (this.quotaService as QuotaService).checkQuota(userId, QuotaResourceType.WORKSPACE, 1);
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('workspace', quotaResult.limit, quotaResult.current);
    }

    const now = new Date().toISOString();
    const workspaceSlug = slugify(input.workspaceSlug) || 'inbox';
    let workspace = await this.contentRepository.upsertWorkspace(userId, {
      id: crypto.randomUUID(),
      workspaceSlug,
      displayName: input.displayName,
      whatsappChatJid: '',
      telegramChatId: '',
      createdAt: now,
      updatedAt: now,
    });


    const initialProject = await this.contentRepository.upsertProject(userId, {
      id: crypto.randomUUID(),
      projectSlug: 'inbox',
      displayName: 'Inbox',
      workspaceId: workspace.id,
      workspaceSlug,
      repositories: [],
      defaultTags: [],
      enabled: true,
      favorite: false,
    });

    await Promise.all([
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.AiReview),
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.AiConversation),
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.ProjectBriefAi),
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.PrContextAi),
    ]);

    return {
      ok: true as const,
      workspace,
      initialProject,
    };
  }

  private async provisionManagedAiIntegration(
    userId: string,
    workspaceSlug: string,
    provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation | IntegrationProvider.ProjectBriefAi | IntegrationProvider.PrContextAi,
  ) {
    const environment = this.runtimeEnvironmentProvider.read();
    const config = getAiProviderConfig(provider, environment);

    await this.credentialRepository.upsertCredential({
      userId,
      workspaceSlug,
      provider,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ enabled: true }, this.runtimeEnvironmentProvider),
      publicMetadata: {
        label: config.label,
        connectedAccount: config.provider && config.provider !== 'none' ? config.provider : null,
      },
    });
  }
}
