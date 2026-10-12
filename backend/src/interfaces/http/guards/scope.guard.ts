import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceScopeResolver } from '../../../application/services/content/workspace-scope-resolver.service.js';
import { SCOPED_METADATA_KEY, type ScopedOptions, type ScopedRequest } from '../scope.decorators.js';
import { RESOLUTION_ERROR_MESSAGES, SCOPE_HEADERS } from './resolution-guards.constants.js';
import { updateRequestContext } from '../../../observability/request-context.js';

export function extractScopeSlugs(request: ScopedRequest): { projectSlug?: string; workspaceSlug?: string } {
  const headerProject = request.headers?.[SCOPE_HEADERS.PROJECT_SLUG];
  const headerWorkspace = request.headers?.[SCOPE_HEADERS.WORKSPACE_SLUG] || request.headers?.[SCOPE_HEADERS.WORKSPACE_SLUG_ALT];

  const projectSlug = request.params?.projectSlug
    || request.query?.projectSlug
    || request.body?.projectSlug
    || (typeof headerProject === 'string' ? headerProject : Array.isArray(headerProject) ? headerProject[0] : undefined);

  const workspaceSlug = request.params?.workspaceSlug
    || request.query?.workspaceSlug
    || request.body?.workspaceSlug
    || (typeof headerWorkspace === 'string' ? headerWorkspace : Array.isArray(headerWorkspace) ? headerWorkspace[0] : undefined);

  return {
    projectSlug: projectSlug ? String(projectSlug).trim() : undefined,
    workspaceSlug: workspaceSlug ? String(workspaceSlug).trim() : undefined,
  };
}

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const options = this.reflector.getAllAndOverride<ScopedOptions>(SCOPED_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) || { project: 'none' };

    const { projectSlug, workspaceSlug } = extractScopeSlugs(request);

    if (options.project === 'required' && !projectSlug) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.PROJECT_SLUG_MISSING);
    }

    if (options.project === 'none' && !workspaceSlug) {
      throw new NotFoundException(RESOLUTION_ERROR_MESSAGES.WORKSPACE_SLUG_MISSING);
    }

    if (options.project === 'optional' && !projectSlug && !workspaceSlug) {
      return true;
    }

    const scope = await this.scopeResolver.resolve(user.id, {
      workspaceSlug,
      projectSlug,
      allowAllProjects: options.allowAllProjects,
    });

    request.scope = scope;
    if (scope.workspaceId) {
      request.workspaceId = scope.workspaceId;
    }
    if (scope.projectId) {
      request.projectId = scope.projectId;
    }
    if (scope.workspaceSlug) {
      updateRequestContext({ workspaceSlug: scope.workspaceSlug });
    }

    return true;
  }
}
