import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { RepositoryRecord } from '../../models/repository-records.models.js';

@Injectable()
export class ListWorkspaceRepositoriesUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, workspaceSlug: string): Promise<{ ok: true; repositories: RepositoryRecord[] }> {
    const repositories = await this.contentRepository.listRepositories(userId, workspaceSlug);
    return { ok: true, repositories };
  }
}
