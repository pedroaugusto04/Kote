import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class SetProjectFavoriteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, projectId: string, favorite: boolean) {
    const updated = await this.contentRepository.setProjectFavorite(userId, projectId, favorite);
    if (!updated) throw new NotFoundException('project_not_found');
    return { ok: true, project: updated };
  }
}
