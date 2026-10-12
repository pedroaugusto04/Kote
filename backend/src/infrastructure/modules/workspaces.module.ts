import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { EnvModule } from './env.module.js';
import { AiModule } from './ai.module.js';
import { QuotaModule } from './quota.module.js';

import {
  ListWorkspacesUseCase,
  CreateWorkspaceUseCase,
  ListWorkspaceRepositoriesUseCase,
  ListWorkspaceCategoriesUseCase,
} from '../../application/use-cases/index.js';
import { GithubRepositoryResolutionService } from '../../application/services/integrations/github-repository-resolution.service.js';
import { WorkspacesController } from '../../interfaces/http/controllers/index.js';

import { WorkspaceScopeResolver } from '../../application/services/content/workspace-scope-resolver.service.js';
import { ScopeGuard } from '../../interfaces/http/guards/scope.guard.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    EnvModule,
    AiModule,
    QuotaModule,
  ],
  controllers: [
    WorkspacesController,
  ],
  providers: [
    ListWorkspacesUseCase,
    CreateWorkspaceUseCase,
    ListWorkspaceRepositoriesUseCase,
    ListWorkspaceCategoriesUseCase,
    GithubRepositoryResolutionService,
    WorkspaceScopeResolver,
    ScopeGuard,
  ],
  exports: [
    ListWorkspacesUseCase,
    CreateWorkspaceUseCase,
    ListWorkspaceRepositoriesUseCase,
    ListWorkspaceCategoriesUseCase,
    GithubRepositoryResolutionService,
    WorkspaceScopeResolver,
    ScopeGuard,
  ],
})
export class WorkspacesModule {}
