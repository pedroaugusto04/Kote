import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ImportDependenciesFromGithubUseCase } from '../../../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import type { AuthenticatedUser } from '../../../../application/auth.js';
import { PostgresWorkspaceRepository } from '../../../../infrastructure/repositories/workspace.repository.js';
import { AccessTokenAuthGuard } from '../../guards/auth.guards.js';

@ApiTags('Integrations')
@Controller('api/integrations/dependency-watch')
@UseGuards(AccessTokenAuthGuard)
export class DependencyWatcherController {
  constructor(
    private readonly importDependenciesFromGithubUseCase: ImportDependenciesFromGithubUseCase,
    private readonly workspaceRepository: PostgresWorkspaceRepository,
  ) {}

  @Post('import')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async importDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { workspaceSlug: string; projectIds?: string[] },
  ) {
    const result = await this.importDependenciesFromGithubUseCase.execute(
      user.id,
      body.workspaceSlug,
      body.projectIds,
    );
    return {
      ok: true,
      data: result,
    };
  }

  @Patch(':workspaceSlug/enable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const workspace = await this.workspaceRepository.getBySlug(user.id, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    await this.workspaceRepository.update(workspace.id, {
      dependencyWatcherEnabled: true,
    });

    return {
      ok: true,
      data: { enabled: true },
    };
  }

  @Patch(':workspaceSlug/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const workspace = await this.workspaceRepository.getBySlug(user.id, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    await this.workspaceRepository.update(workspace.id, {
      dependencyWatcherEnabled: false,
    });

    return {
      ok: true,
      data: { enabled: false },
    };
  }
}
