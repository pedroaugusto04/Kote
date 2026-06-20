import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.decorators.js';

export type WorkspaceRequest = AuthenticatedRequest & {
  workspaceId?: string;
};

export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<WorkspaceRequest>();
  if (!request.workspaceId) {
    throw new Error('workspace_id_missing_from_request');
  }
  return request.workspaceId;
});
