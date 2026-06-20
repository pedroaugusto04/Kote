import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';

import { ContentRepository } from '../../application/ports/notes/content.repository.js';
import type { WorkspaceRequest } from './workspace.decorators.js';

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
      throw new NotFoundException('workspace_slug_missing');
    }

    const workspace = await this.contentRepository.getWorkspaceBySlug(user.id, String(workspaceSlug));
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    request.workspaceId = workspace.id;
    return true;
  }
}
