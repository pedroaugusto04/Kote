import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { AiModule } from './ai.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { EnvModule } from './env.module.js';
import { QuotaModule } from './quota.module.js';
import { StorageModule } from './storage.module.js';

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
  GetProjectCoverageUseCase,
  ExportProjectNotesZipUseCase,
  ListProjectDecisionsUseCase,
  ExportProjectAdrsUseCase,
} from '../../application/use-cases/index.js';
import { ListProjectDependenciesUseCase } from '../../application/use-cases/dependency-watcher/list-project-dependencies.use-case.js';
import {
  ProjectsController,
  ProjectFoldersController,
  ProjectInsightsController,
  ReviewsController,
} from '../../interfaces/http/controllers/index.js';

import { SyncProjectFilesService } from '../../application/services/projects/sync-project-files.service.js';
import { SemanticClusteringService } from '../../application/services/query/semantic-clustering.service.js';
import { GitCommitService } from '../../application/services/projects/git-commit.service.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    AiModule,
    WorkspacesModule,
    EnvModule,
    QuotaModule,
    StorageModule,
  ],
  controllers: [
    ProjectsController,
    ProjectFoldersController,
    ProjectInsightsController,
    ReviewsController,
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
    GetProjectCoverageUseCase,
    ExportProjectNotesZipUseCase,
    ListProjectDecisionsUseCase,
    ExportProjectAdrsUseCase,
    ListProjectDependenciesUseCase,
    SyncProjectFilesService,
    SemanticClusteringService,
    GitCommitService,
  ],
  exports: [
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    ListProjectBriefHistoryUseCase,
    GetProjectCoverageUseCase,
    ExportProjectNotesZipUseCase,
    ListProjectDecisionsUseCase,
    ExportProjectAdrsUseCase,
    SyncProjectFilesService,
    GitCommitService,
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


