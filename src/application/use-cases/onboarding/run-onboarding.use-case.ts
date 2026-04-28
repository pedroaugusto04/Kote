import { Injectable } from '@nestjs/common';

import { readEnvironment } from '../../../adapters/environment.js';
import { OnboardingOperation } from '../../../contracts/enums.js';
import type { OnboardingInput } from '../../../contracts/onboarding.js';
import { ContentRepository } from '../../ports/repositories.js';

@Injectable()
export class RunOnboardingUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: OnboardingInput, userId: string) {
    if (input.operation === OnboardingOperation.Upsert) {
      await this.contentRepository.upsertWorkspace(userId, {
        workspaceSlug: input.workspaceSlug,
        displayName: input.displayName || input.workspaceSlug,
        whatsappGroupJid: input.whatsappGroupJid,
        telegramChatId: input.telegramChatId,
        githubRepos: input.githubRepos,
        projectSlugs: input.projects.map((project) => project.projectSlug),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      for (const project of input.projects) {
        await this.contentRepository.upsertProject(userId, {
          projectSlug: project.projectSlug,
          displayName: project.displayName,
          repoFullName: project.repoFullName,
          workspaceSlug: input.workspaceSlug,
          aliases: project.aliases,
          defaultTags: project.defaultTags,
          enabled: true,
        });
      }
    }
    const [workspaces, projects] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjects(userId),
    ]);
    return {
      ok: true,
      operation: input.operation,
      workspaceSlug: input.workspaceSlug,
      workspaces,
      projects,
      links: {
        api: readEnvironment().publicBaseUrl ? `${readEnvironment().publicBaseUrl}/api` : '',
        queryReady: true,
      },
    };
  }
}
