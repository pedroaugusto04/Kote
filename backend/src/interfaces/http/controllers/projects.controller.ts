import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateProjectUseCase } from '../../../application/use-cases/projects/create-project.use-case.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { createProjectBodySchema, type CreateProjectBody } from '../dto/project.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/projects')
@UseGuards(AccessTokenAuthGuard)
export class ProjectsController {
  constructor(private readonly createProject: CreateProjectUseCase) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createProjectBodySchema, 'invalid_create_project_payload')) body: CreateProjectBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createProject.execute(body, user.id);
  }
}
