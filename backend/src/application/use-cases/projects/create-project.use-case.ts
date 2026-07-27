import { Injectable } from '@nestjs/common';

import type { CreateProjectDto } from '../../dto/project.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { GithubRepositoryResolutionService } from '../../services/integrations/github-repository-resolution.service.js';
import { QuotaService } from '../../services/quota/quota.service.js';
import { QuotaResourceType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { toProjectRecord } from '../../mappers/project.mapper.js';
import { requireWorkspace, assertProjectSlugUnique } from '../../helpers/resource-validation.helpers.js';

@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly quotaService: QuotaService,
  ) { }

  async execute(input: CreateProjectDto, userId: string) {
    const workspace = await requireWorkspace(this.contentRepository, userId);

    const quotaResult = await this.quotaService.checkQuota(userId, QuotaResourceType.PROJECT, 1, {
      workspaceId: workspace.id,
    });
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('project', quotaResult.limit, quotaResult.current);
    }

    await assertProjectSlugUnique(this.contentRepository, userId, input.projectSlug);

    const selectedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId,
      workspaceSlug: workspace.workspaceSlug,
      repositoryIds: input.repositoryIds,
    });

    const projectRecord = toProjectRecord(input, workspace.id, workspace.workspaceSlug, selectedRepositories);
    const project = await this.contentRepository.upsertProject(userId, projectRecord);

    return {
      ok: true as const,
      project,
      workspace,
    };
  }
}
