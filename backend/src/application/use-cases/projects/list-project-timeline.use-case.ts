import { Injectable, NotFoundException } from '@nestjs/common';

import type { ListProjectTimelineInput } from '../../models/project-timeline.models.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class ListProjectTimelineUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, input: ListProjectTimelineInput) {
    if (input.projectSlug) {
      const project = await this.contentRepository.getProjectBySlug(userId, input.projectSlug);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
    }

    return this.contentRepository.listProjectTimeline(userId, input);
  }
}
