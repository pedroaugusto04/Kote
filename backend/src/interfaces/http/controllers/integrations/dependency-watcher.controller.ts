import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';

import { ImportDependenciesFromGithubUseCase } from '../../../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import type { AuthenticatedUser } from '../../../../application/auth.js';

@Controller('integrations/dependency-watch')
export class DependencyWatcherController {
  constructor(
    private readonly importDependenciesFromGithubUseCase: ImportDependenciesFromGithubUseCase,
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
}
