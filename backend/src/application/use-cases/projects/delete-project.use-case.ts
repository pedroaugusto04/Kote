import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class DeleteProjectUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) { }

  async execute(projectId: string, userId: string) {
    const project = await this.scopeResolver.resolveProject(userId, projectId);

    const notes = await this.contentRepository.listNotesLite(userId);
    if (notes.some((note) => note.projectId === projectId)) {
      throw new BadRequestException('project_has_notes');
    }

    await this.contentRepository.deleteProject(userId, projectId);

    const workspace = project.workspaceId
      ? await this.contentRepository.getWorkspaceById(project.workspaceId)
      : null;

    return { ok: true as const, projectSlug: project.projectSlug, workspace };
  }
}
