import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateProjectUseCase, DeleteProjectUseCase, UpdateProjectUseCase } from '../../../application/use-cases/projects/create-project.use-case.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { createProjectBodySchema, projectSlugParamSchema, updateProjectBodySchema, type CreateProjectBody, type ProjectSlugParam, type UpdateProjectBody } from '../dto/project.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectsController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createProjectBodySchema, 'invalid_create_project_payload')) body: CreateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createProject.execute(body, user.id);
  }

  @Patch(':projectSlug')
  @UseGuards(TrustedOriginGuard)
  update(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @Body(new ZodValidationPipe(updateProjectBodySchema, 'invalid_update_project_payload')) body: UpdateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateProject.execute({ ...body, projectSlug: params.projectSlug }, user.id);
  }

  @Delete(':projectSlug')
  @UseGuards(TrustedOriginGuard)
  remove(
    @Param(new ZodValidationPipe(projectSlugParamSchema, 'invalid_project_slug')) params: ProjectSlugParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteProjectUseCase.execute(params.projectSlug, user.id);
  }
}
