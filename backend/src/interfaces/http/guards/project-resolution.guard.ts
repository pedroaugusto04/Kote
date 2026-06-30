import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../../application/ports/notes/content.repository.js';
import type { ProjectRequest } from '../project.decorators.js';
import { RESOLUTION_ERROR_MESSAGES, RESOLUTION_SPECIAL_VALUES } from './resolution-guards.constants.js';

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
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.PROJECT_SLUG_MISSING);
    }

    if (projectSlug === RESOLUTION_SPECIAL_VALUES.ALL_PROJECTS) {
      request.projectId = RESOLUTION_SPECIAL_VALUES.ALL_PROJECTS;
      return true;
    }

    const project = await this.contentRepository.getProjectBySlug(user.id, String(projectSlug));
    if (!project || !project.enabled) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.PROJECT_NOT_FOUND);
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

    if (projectSlug === RESOLUTION_SPECIAL_VALUES.ALL_PROJECTS) {
      request.projectId = RESOLUTION_SPECIAL_VALUES.ALL_PROJECTS;
      return true;
    }

    const project = await this.contentRepository.getProjectBySlug(user.id, String(projectSlug));
    if (!project || !project.enabled) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.PROJECT_NOT_FOUND);
    }

    request.projectId = project.id;
    if (project.workspaceId) {
      request.workspaceId = project.workspaceId;
    }
    return true;
  }
}
