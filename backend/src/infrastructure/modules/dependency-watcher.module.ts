import { Module } from '@nestjs/common';

import { DependencyWatcherService } from '../../application/services/dependency-watcher/dependency-watcher.service.js';
import { DependencyWatcherWorker } from '../../application/workers/dependency-watcher.worker.js';
import { ImportDependenciesFromGithubUseCase } from '../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { DefaultDependencyAlertGateway } from '../ai/dependency-alert.gateway.js';
import { PostgresDependencyWatcherRepository } from '../repositories/dependency-watcher.repository.js';
import { DependencyAlertGateway } from '../../application/ports/dependency-watcher/dependency-alert.port.js';
import { DependencyWatcherRepository } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { DatabaseModule } from './database.module.js';
import { NotesModule } from './notes.module.js';
import { AuthModule } from './auth.module.js';
import { EnvModule } from './env.module.js';
import { LoggerModule } from './logger.module.js';
import { EmailModule } from './email.module.js';

@Module({
  imports: [
    DatabaseModule,
    NotesModule,
    AuthModule,
    EnvModule,
    LoggerModule,
    EmailModule,
  ],
  providers: [
    PostgresDependencyWatcherRepository,
    DefaultDependencyAlertGateway,
    DependencyWatcherService,
    DependencyWatcherWorker,
    ImportDependenciesFromGithubUseCase,
    {
      provide: DependencyWatcherRepository,
      useExisting: PostgresDependencyWatcherRepository,
    },
    {
      provide: DependencyAlertGateway,
      useExisting: DefaultDependencyAlertGateway,
    },
  ],
  exports: [
    DependencyWatcherService,
    DependencyWatcherWorker,
    ImportDependenciesFromGithubUseCase,
    DependencyWatcherRepository,
    DependencyAlertGateway,
  ],
})
export class DependencyWatcherModule {}
