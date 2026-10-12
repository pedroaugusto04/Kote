import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ImportDependenciesFromGithubUseCase } from '../../../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { ListDependencyMonitoredRepositoriesUseCase } from '../../../../application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';
import { SaveDependencyMonitoredRepositoriesUseCase } from '../../../../application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';
import { CheckProjectDependenciesUseCase } from '../../../../application/use-cases/dependency-watcher/check-project-dependencies.use-case.js';
import { CheckDependencyUseCase } from '../../../../application/use-cases/dependency-watcher/check-dependency.use-case.js';
import { DependencyWatcherService } from '../../../../application/services/dependency-watcher/dependency-watcher.service.js';
import { CurrentUser } from '../../auth.decorators.js';
import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  saveMonitoredRepositoriesBodySchema,
  importDependenciesBodySchema,
  checkDependencyBodySchema,
  toggleDependencyBodySchema,
  type SaveMonitoredRepositoriesBody,
  type ImportDependenciesBody,
  type CheckDependencyBody,
  type ToggleDependencyBody,
} from '../../dto/dependency-watcher.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

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
    private readonly dependencyWatcherService: DependencyWatcherService,
  ) {}

  @Get('repositories')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  async listMonitoredRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    const result = await this.listDependencyMonitoredRepositoriesUseCase.execute(user.id, scope.workspaceSlug);
    return {
      ok: true,
      ...result,
    };
  }

  @Put('repositories')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async saveMonitoredRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(saveMonitoredRepositoriesBodySchema, 'invalid_save_monitored_repositories_payload')) body: SaveMonitoredRepositoriesBody,
  ) {
    const result = await this.saveDependencyMonitoredRepositoriesUseCase.execute(
      user.id,
      scope.workspaceSlug,
      body.repositoryIds || [],
    );
    return {
      ok: true,
      data: result,
    };
  }

  @Post('import')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async importDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(importDependenciesBodySchema, 'invalid_import_dependencies_payload')) body: ImportDependenciesBody,
  ) {
    const result = await this.importDependenciesFromGithubUseCase.execute(
      user.id,
      scope.workspaceSlug,
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
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    await this.dependencyWatcherService.setWorkspaceWatcherStatus(user.id, scope.workspaceId, scope.workspaceSlug, true);

    return {
      ok: true,
      data: { enabled: true },
    };
  }

  @Patch(':workspaceSlug/disable')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    await this.dependencyWatcherService.setWorkspaceWatcherStatus(user.id, scope.workspaceId, scope.workspaceSlug, false);

    return {
      ok: true,
      data: { enabled: false },
    };
  }

  @Post('check-project')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async checkProject(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    const result = await this.checkProjectDependenciesUseCase.execute(user.id, scope.projectId!, scope.projectSlug!, scope.workspaceId);
    return {
      ok: true,
      data: result,
    };
  }

  @Post('check-dependency')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async checkDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Body(new ZodValidationPipe(checkDependencyBodySchema, 'invalid_check_dependency_payload')) body: CheckDependencyBody,
  ) {
    const result = await this.checkDependencyUseCase.execute(user.id, body.dependencyId, scope.projectId!, scope.projectSlug!, scope.workspaceId);
    return {
      ok: true,
      data: result,
    };
  }

  @Patch('dependency/:dependencyId/toggle')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async toggleDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
    @Param('dependencyId') dependencyId: string,
    @Body(new ZodValidationPipe(toggleDependencyBodySchema, 'invalid_toggle_dependency_payload')) body: ToggleDependencyBody,
  ) {
    await this.dependencyWatcherService.toggleDependency(user.id, scope.workspaceId, dependencyId, body.enabled);

    return {
      ok: true,
      data: { enabled: body.enabled },
    };
  }
}
