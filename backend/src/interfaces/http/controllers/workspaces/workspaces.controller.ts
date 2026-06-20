import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import { CreateWorkspaceUseCase, ListWorkspaceRepositoriesUseCase, ListWorkspaceCategoriesUseCase } from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import { WorkspaceResolutionGuard } from '../../workspace-resolution.guard.js';
import { WorkspaceId } from '../../workspace.decorators.js';
import { createWorkspaceBodySchema, type CreateWorkspaceBody } from '../../dto/workspace.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Workspaces')
@Controller('api/workspaces')
@UseGuards(AccessTokenAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly createWorkspace: CreateWorkspaceUseCase,
    private readonly listRepositories: ListWorkspaceRepositoriesUseCase,
    private readonly listCategories: ListWorkspaceCategoriesUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(
    @Body(new ZodValidationPipe(createWorkspaceBodySchema, 'invalid_create_workspace_payload')) body: CreateWorkspaceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createWorkspace.execute(body, user.id);
  }

  @Get(':workspaceSlug/repositories')
  @UseGuards(WorkspaceResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List workspace repositories' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiResponse({ status: 200, description: 'Repositories retrieved successfully' })
  repositories(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listRepositories.execute(user.id, workspaceId);
  }

  @Get(':workspaceSlug/categories')
  @UseGuards(WorkspaceResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List workspace categories' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  categories(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listCategories.execute(user.id, workspaceId);
  }
}
