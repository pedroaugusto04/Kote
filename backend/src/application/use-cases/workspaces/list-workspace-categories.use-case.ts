import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { CategoryRecord } from '../../models/repository-records.models.js';

@Injectable()
export class ListWorkspaceCategoriesUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, workspaceId: string): Promise<{ ok: true; categories: CategoryRecord[] }> {
    const categories = await this.contentRepository.listCategories(userId, workspaceId);
    return { ok: true, categories };
  }
}
