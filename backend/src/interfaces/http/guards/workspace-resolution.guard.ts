import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../../application/ports/notes/content.repository.js';
import type { WorkspaceRequest } from '../workspace.decorators.js';
import { RESOLUTION_ERROR_MESSAGES } from './resolution-guards.constants.js';

@Injectable()
export class WorkspaceResolutionGuard implements CanActivate {
  constructor(private readonly contentRepository: ContentRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const workspaceSlug = request.params.workspaceSlug || request.query.workspaceSlug || request.body.workspaceSlug;
    if (!workspaceSlug) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.WORKSPACE_SLUG_MISSING);
    }

    const workspace = await this.contentRepository.getWorkspaceBySlug(user.id, String(workspaceSlug));
    if (!workspace) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
    }

    request.workspaceId = workspace.id;
    return true;
  }
}
