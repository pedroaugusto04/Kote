import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, Get, Put, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ImportDependenciesFromGithubUseCase } from '../../../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { ListDependencyMonitoredRepositoriesUseCase } from '../../../../application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';
import { SaveDependencyMonitoredRepositoriesUseCase } from '../../../../application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';
import { CheckProjectDependenciesUseCase } from '../../../../application/use-cases/dependency-watcher/check-project-dependencies.use-case.js';
import { CheckDependencyUseCase } from '../../../../application/use-cases/dependency-watcher/check-dependency.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import type { AuthenticatedUser } from '../../../../application/auth.js';
import { PostgresWorkspaceRepository } from '../../../../infrastructure/repositories/workspace.repository.js';
import { PostgresDependencyWatcherRepository } from '../../../../infrastructure/repositories/dependency-watcher.repository.js';
import { AccessTokenAuthGuard } from '../../guards/auth.guards.js';

@ApiTags('Integrations')
@Controller('api/integrations/dependency-watch')
@UseGuards(AccessTokenAuthGuard)
export class DependencyWatcherController {
  constructor(
    private readonly importDependenciesFromGithubUseCase: ImportDependenciesFromGithubUseCase,
    private readonly listDependencyMonitoredRepositoriesUseCase: ListDependencyMonitoredRepositoriesUseCase,
    private readonly saveDependencyMonitoredRepositoriesUseCase: SaveDependencyMonitoredRepositoriesUseCase,
    private readonly checkProjectDependenciesUseCase: CheckProjectDependenciesUseCase,
    private readonly checkDependencyUseCase: CheckDependencyUseCase,
    private readonly workspaceRepository: PostgresWorkspaceRepository,
    private readonly dependencyWatcherRepository: PostgresDependencyWatcherRepository,
  ) {}

  @Get('repositories')
  @ApiBearerAuth()
  async listMonitoredRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspaceSlug') workspaceSlug: string,
  ) {
    const result = await this.listDependencyMonitoredRepositoriesUseCase.execute(user.id, workspaceSlug);
    return {
      ok: true,
      ...result,
    };
  }

  @Put('repositories')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async saveMonitoredRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { workspaceSlug: string; repositoryIds: string[] },
  ) {
    const result = await this.saveDependencyMonitoredRepositoriesUseCase.execute(
      user.id,
      body.workspaceSlug,
      body.repositoryIds || [],
    );
    return {
      ok: true,
      data: result,
    };
  }

  @Post('import')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async importDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { workspaceSlug: string; projectIds?: string[]; repositoryIds?: string[] },
  ) {
    const result = await this.importDependenciesFromGithubUseCase.execute(
      user.id,
      body.workspaceSlug,
      {
        projectIds: body.projectIds,
        repositoryIds: body.repositoryIds,
      },
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

  @Post('check-project')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async checkProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { projectId: string; projectSlug: string },
  ) {
    const result = await this.checkProjectDependenciesUseCase.execute(user.id, body.projectId, body.projectSlug);
    return {
      ok: true,
      data: result,
    };
  }

  @Post('check-dependency')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async checkDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { dependencyId: string; projectId: string; projectSlug: string },
  ) {
    const result = await this.checkDependencyUseCase.execute(user.id, body.dependencyId, body.projectId, body.projectSlug);
    return {
      ok: true,
      data: result,
    };
  }

  @Patch('dependency/:dependencyId/toggle')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async toggleDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependencyId') dependencyId: string,
    @Body() body: { workspaceSlug: string; enabled: boolean },
  ) {
    const workspace = await this.workspaceRepository.getBySlug(user.id, body.workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    const dependency = await this.dependencyWatcherRepository.findById(user.id, workspace.id, dependencyId);
    if (!dependency) {
      throw new NotFoundException('dependency_not_found');
    }

    await this.dependencyWatcherRepository.update(dependencyId, { enabled: body.enabled });

    return {
      ok: true,
      data: { enabled: body.enabled },
    };
  }
}
