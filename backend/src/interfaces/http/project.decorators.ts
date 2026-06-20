import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.decorators.js';

export type ProjectRequest = AuthenticatedRequest & {
  projectId?: string;
  workspaceId?: string;
};

export const ProjectId = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
  const request = context.switchToHttp().getRequest<ProjectRequest>();
  return request.projectId;
});
