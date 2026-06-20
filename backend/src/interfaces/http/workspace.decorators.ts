import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.decorators.js';

export type WorkspaceRequest = AuthenticatedRequest & {
  workspaceId?: string;
};

export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
  const request = context.switchToHttp().getRequest<WorkspaceRequest>();
  return request.workspaceId;
});
