import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) { }

  async execute(projectId: string, userId: string) {

    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const notes = await this.contentRepository.listNotesLite(userId);
    if (notes.some((note) => note.projectId === projectId)) {
      throw new BadRequestException('project_has_notes');
    }

    await this.contentRepository.deleteProject(userId, projectId);

    const workspace = project.workspaceId
      ? await this.contentRepository.listWorkspaces(userId).then(ws => ws.find(w => w.id === project.workspaceId))
      : null;

    return { ok: true as const, projectSlug: project.projectSlug, workspace };
  }
}
