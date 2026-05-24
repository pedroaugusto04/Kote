import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import { CreateWorkspaceUseCase, ListWorkspaceRepositoriesUseCase } from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import { createWorkspaceBodySchema, type CreateWorkspaceBody } from '../../dto/workspace.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@Controller('api/workspaces')
@UseGuards(AccessTokenAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly createWorkspace: CreateWorkspaceUseCase,
    private readonly listRepositories: ListWorkspaceRepositoriesUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createWorkspaceBodySchema, 'invalid_create_workspace_payload')) body: CreateWorkspaceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createWorkspace.execute(body, user.id);
  }

  @Get(':workspaceSlug/repositories')
  repositories(
    @Param('workspaceSlug') workspaceSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listRepositories.execute(user.id, workspaceSlug);
  }
}
