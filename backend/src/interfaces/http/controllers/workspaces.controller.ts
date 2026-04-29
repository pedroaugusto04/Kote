import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateWorkspaceUseCase } from '../../../application/use-cases/workspaces/create-workspace.use-case.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { createWorkspaceBodySchema, type CreateWorkspaceBody } from '../dto/workspace.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/workspaces')
@UseGuards(AccessTokenAuthGuard)
export class WorkspacesController {
  constructor(private readonly createWorkspace: CreateWorkspaceUseCase) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createWorkspaceBodySchema, 'invalid_create_workspace_payload')) body: CreateWorkspaceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createWorkspace.execute(body, user.id);
  }
}
