import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param } from '@nestjs/common';

import { ImportDependenciesFromGithubUseCase } from '../../../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import type { AuthenticatedUser } from '../../../../application/auth.js';
import { PostgresWorkspaceRepository } from '../../../../infrastructure/repositories/workspace.repository.js';

@Controller('integrations/dependency-watch')
export class DependencyWatcherController {
  constructor(
    private readonly importDependenciesFromGithubUseCase: ImportDependenciesFromGithubUseCase,
    private readonly workspaceRepository: PostgresWorkspaceRepository,
  ) {}

  @Post('import')
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
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const workspace = await this.workspaceRepository.getBySlug(user.id, workspaceSlug);
    if (!workspace) {
      return {
        ok: false,
        error: 'Workspace not found',
      };
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
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const workspace = await this.workspaceRepository.getBySlug(user.id, workspaceSlug);
    if (!workspace) {
      return {
        ok: false,
        error: 'Workspace not found',
      };
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
