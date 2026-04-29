import { ConflictException, Injectable } from '@nestjs/common';

import { slugify } from '../../../domain/strings.js';
import type { CreateWorkspaceInput } from '../../models/workspace-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: CreateWorkspaceInput, userId: string) {
    const existing = await this.contentRepository.listWorkspaces(userId);
    if (existing.length > 0) {
      throw new ConflictException({
        code: 'workspace_already_exists',
        details: { fieldErrors: { workspaceSlug: 'Este usuario ja possui um workspace.' } },
      });
    }

    const now = new Date().toISOString();
    const workspaceSlug = slugify(input.workspaceSlug) || 'inbox';
    const workspace = await this.contentRepository.upsertWorkspace(userId, {
      workspaceSlug,
      displayName: input.displayName,
      whatsappGroupJid: '',
      telegramChatId: '',
      githubRepos: [],
      projectSlugs: ['inbox'],
      createdAt: now,
      updatedAt: now,
    });
    const initialProject = await this.contentRepository.upsertProject(userId, {
      projectSlug: 'inbox',
      displayName: 'Inbox',
      repoFullName: '',
      workspaceSlug,
      aliases: [],
      defaultTags: [],
      enabled: true,
    });

    return {
      ok: true as const,
      workspace,
      initialProject,
    };
  }
}
