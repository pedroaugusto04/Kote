import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.decorators.js';
import type { WorkspaceScope } from '../../application/models/workspace-scope.models.js';

export const SCOPED_METADATA_KEY = 'scoped_options';

export type ScopedOptions = {
  project?: 'required' | 'optional' | 'none';
  allowAllProjects?: boolean;
};

export const Scoped = (options: ScopedOptions = { project: 'none' }) => SetMetadata(SCOPED_METADATA_KEY, options);

export type ScopedRequest = AuthenticatedRequest & {
  scope?: WorkspaceScope;
  workspaceId?: string;
  projectId?: string;
};

export const Scope = createParamDecorator((_data: unknown, context: ExecutionContext): WorkspaceScope | undefined => {
  const request = context.switchToHttp().getRequest<ScopedRequest>();
  return request.scope;
});
