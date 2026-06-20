import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../application/ports/notes/content.repository.js';
import type { ProjectRequest } from './project.decorators.js';

@Injectable()
export class ProjectResolutionGuard implements CanActivate {
  constructor(private readonly contentRepository: ContentRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const projectSlug = request.params.projectSlug || request.query.projectSlug || request.body?.projectSlug;
    if (!projectSlug) {
      throw new NotFoundException('project_slug_missing');
    }

    if (projectSlug === 'all') {
      request.projectId = 'all';
      return true;
    }

    const project = await this.contentRepository.getProjectBySlug(user.id, String(projectSlug));
    if (!project || !project.enabled) {
      throw new NotFoundException('project_not_found');
    }

    request.projectId = project.id;
    request.workspaceId = project.workspaceId;
    return true;
  }
}

@Injectable()
export class OptionalProjectResolutionGuard implements CanActivate {
  constructor(private readonly contentRepository: ContentRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const workspaceSlug = request.params.workspaceSlug || request.query.workspaceSlug || request.body?.workspaceSlug;
    if (workspaceSlug) {
      const workspace = await this.contentRepository.getWorkspaceBySlug(user.id, String(workspaceSlug));
      if (workspace) {
        request.workspaceId = workspace.id;
      }
    }

    const projectSlug = request.params.projectSlug || request.query.projectSlug || request.body?.projectSlug;
    if (!projectSlug) {
      return true;
    }

    if (projectSlug === 'all') {
      request.projectId = 'all';
      return true;
    }

    const project = await this.contentRepository.getProjectBySlug(user.id, String(projectSlug));
    if (!project || !project.enabled) {
      throw new NotFoundException('project_not_found');
    }

    request.projectId = project.id;
    if (project.workspaceId) {
      request.workspaceId = project.workspaceId;
    }
    return true;
  }
}
