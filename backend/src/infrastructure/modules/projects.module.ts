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
  GetProjectCoverageUseCase,
} from '../../application/use-cases/index.js';
import { ListProjectDependenciesUseCase } from '../../application/use-cases/dependency-watcher/list-project-dependencies.use-case.js';
import { DependencyWatcherRepository } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { PostgresDependencyWatcherRepository } from '../repositories/dependency-watcher.repository.js';
import { ProjectsController } from '../../interfaces/http/controllers/index.js';
import { ProjectCoverageRepository } from '../../application/ports/projects/project-coverage.repository.js';
import { PostgresProjectCoverageRepository } from '../repositories/project-coverage.repository.js';
import { ProjectResolutionGuard, OptionalProjectResolutionGuard } from '../../interfaces/http/guards/project-resolution.guard.js';

import { SyncProjectFilesService } from '../../application/services/projects/sync-project-files.service.js';
import { SemanticClusteringService } from '../../application/services/query/semantic-clustering.service.js';
import { ProjectMapClusterRepository } from '../repositories/project-map-cluster.repository.js';

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
    GetProjectCoverageUseCase,
    ListProjectDependenciesUseCase,
    SyncProjectFilesService,
    SemanticClusteringService,
    ProjectMapClusterRepository,
    PostgresProjectCoverageRepository,
    PostgresDependencyWatcherRepository,
    { provide: ProjectCoverageRepository, useExisting: PostgresProjectCoverageRepository },
    { provide: DependencyWatcherRepository, useExisting: PostgresDependencyWatcherRepository },
    ProjectResolutionGuard,
    OptionalProjectResolutionGuard,
  ],
  exports: [
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    ListProjectBriefHistoryUseCase,
    GetProjectCoverageUseCase,
    SyncProjectFilesService,
    ProjectCoverageRepository,
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


