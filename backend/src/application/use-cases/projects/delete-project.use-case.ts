import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) { }

  async execute(projectSlug: string, userId: string) {

    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const notes = await this.contentRepository.listNotes(userId);
    if (notes.some((note) => note.projectSlug === projectSlug)) {
      throw new BadRequestException('project_has_notes');
    }

    await this.contentRepository.deleteProject(userId, projectSlug);

    const workspace = (await this.contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === project.workspaceSlug);

    return { ok: true as const, projectSlug, workspace };
  }
}
