import { Body, Controller, Delete, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  SetProjectFavoriteUseCase,
  UpdateProjectUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  createProjectBodySchema,
  setProjectFavoriteBodySchema,
  updateProjectBodySchema,
  type CreateProjectBody,
  type SetProjectFavoriteBody,
  type UpdateProjectBody,
} from '../../dto/project.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  toCreateProjectDto,
  toUpdateProjectDto,
} from '../../mappers/project.mapper.js';

@ApiTags('Projects')
@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectsController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly setProjectFavoriteUseCase: SetProjectFavoriteUseCase,
  ) { }

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(
    @Body(new ZodValidationPipe(createProjectBodySchema, 'invalid_create_project_payload')) body: CreateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dto = toCreateProjectDto(body);
    return this.createProject.execute(dto, user.id);
  }

  @Patch(':projectSlug')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(updateProjectBodySchema, 'invalid_update_project_payload')) body: UpdateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dto = toUpdateProjectDto(body, scope.projectId!);
    return this.updateProject.execute(dto, user.id);
  }

  @Delete(':projectSlug')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(
    @Scope() scope: WorkspaceScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectUseCase.execute(scope.projectId!, user.id);
  }

  @Patch(':projectSlug/favorite')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set project favorite status' })
  @ApiParam({ name: 'projectSlug', description: 'Project slug' })
  @ApiResponse({ status: 200, description: 'Favorite status updated' })
  setFavorite(
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(setProjectFavoriteBodySchema, 'invalid_set_favorite_payload')) body: SetProjectFavoriteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.setProjectFavoriteUseCase.execute(user.id, scope.projectId!, body.favorite);
  }
}
