import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { AiModule } from './ai.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { EnvModule } from './env.module.js';
import { QuotaModule } from './quota.module.js';

import {
  ListPaginatedProjectsUseCase,
  CreateProjectUseCase,
  UpdateProjectUseCase,
  DeleteProjectUseCase,
  ListProjectFoldersUseCase,
  ListProjectKnowledgeMapUseCase,
  ListProjectTimelineUseCase,
  CreateProjectFolderUseCase,
  UpdateProjectFolderUseCase,
  DeleteProjectFolderUseCase,
  SetProjectFavoriteUseCase,
  GenerateProjectBriefUseCase,
  GetProjectBriefUseCase,
  ListProjectBriefHistoryUseCase,
  GetReviewDetailUseCase,
  ListPaginatedReviewsUseCase,
} from '../../application/use-cases/index.js';
import { ProjectsController } from '../../interfaces/http/controllers/index.js';
import { ProjectResolutionGuard, OptionalProjectResolutionGuard } from '../../interfaces/http/guards/project-resolution.guard.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    AiModule,
    WorkspacesModule,
    EnvModule,
    QuotaModule,
  ],
  controllers: [
    ProjectsController,
  ],
  providers: [
    ListPaginatedProjectsUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    ListProjectFoldersUseCase,
    ListProjectKnowledgeMapUseCase,
    ListProjectTimelineUseCase,
    CreateProjectFolderUseCase,
    UpdateProjectFolderUseCase,
    DeleteProjectFolderUseCase,
    SetProjectFavoriteUseCase,
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    ListProjectBriefHistoryUseCase,
    GetReviewDetailUseCase,
    ListPaginatedReviewsUseCase,
    ProjectResolutionGuard,
    OptionalProjectResolutionGuard,
  ],
  exports: [
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    ListProjectBriefHistoryUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    CreateProjectFolderUseCase,
    ListPaginatedProjectsUseCase,
    ListPaginatedReviewsUseCase,
    GetReviewDetailUseCase,
    ProjectResolutionGuard,
    OptionalProjectResolutionGuard,
  ],
})
export class ProjectsModule {}

