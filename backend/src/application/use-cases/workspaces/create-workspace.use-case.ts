import { ConflictException, Injectable } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { encryptConfig } from '../../credentials.js';
import type { CreateWorkspaceInput } from '../../models/workspace-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { CredentialRepository } from '../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly runtimeEnvironmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(input: CreateWorkspaceInput, userId: string) {
    const existing = await this.contentRepository.listWorkspaces(userId);
    if (existing.length > 0) {
      throw new ConflictException({
        code: 'workspace_already_exists',
        details: { fieldErrors: { workspaceSlug: 'This user already has a workspace.' } },
      });
    }

    const now = new Date().toISOString();
    const workspaceSlug = slugify(input.workspaceSlug) || 'inbox';
    const workspace = await this.contentRepository.upsertWorkspace(userId, {
      workspaceSlug,
      displayName: input.displayName,
      whatsappChatJid: '',
      telegramChatId: '',
      createdAt: now,
      updatedAt: now,
    });
    const initialProject = await this.contentRepository.upsertProject(userId, {
      projectSlug: 'inbox',
      displayName: 'Inbox',
      repositories: [],
      workspaceSlug,
      defaultTags: [],
      enabled: true,
      favorite: false,
    });

    await Promise.all([
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.AiReview),
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.AiConversation),
      this.provisionManagedAiIntegration(userId, workspaceSlug, IntegrationProvider.ProjectBriefAi),
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
    provider: IntegrationProvider.AiReview | IntegrationProvider.AiConversation | IntegrationProvider.ProjectBriefAi,
  ) {
    const environment = this.runtimeEnvironmentProvider.read();
    const runtimeProvider = provider === IntegrationProvider.AiReview
      ? environment.reviewAiProvider
      : provider === IntegrationProvider.ProjectBriefAi
        ? environment.projectBriefAiProvider
        : environment.conversationAiProvider;
    const label = provider === IntegrationProvider.AiReview
      ? 'Review AI'
      : provider === IntegrationProvider.ProjectBriefAi
        ? 'Project Brief AI'
        : 'Conversation AI';

    await this.credentialRepository.upsertCredential({
      userId,
      workspaceSlug,
      provider,
      status: CredentialRecordStatus.Connected,
      encryptedConfig: encryptConfig({ enabled: true }, this.runtimeEnvironmentProvider),
      publicMetadata: {
        label,
        connectedAccount: runtimeProvider && runtimeProvider !== 'none' ? runtimeProvider : null,
      },
    });
  }
}
