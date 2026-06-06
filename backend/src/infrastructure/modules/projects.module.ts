import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { AiModule } from './ai.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { EnvModule } from './env.module.js';

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
  GetReviewDetailUseCase,
  ListPaginatedReviewsUseCase,
} from '../../application/use-cases/index.js';
import { ProjectsController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    AiModule,
    WorkspacesModule,
    EnvModule,
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
    GetReviewDetailUseCase,
    ListPaginatedReviewsUseCase,
  ],
  exports: [
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    CreateProjectFolderUseCase,
    ListPaginatedProjectsUseCase,
    ListPaginatedReviewsUseCase,
    GetReviewDetailUseCase,
  ],
})
export class ProjectsModule {}
