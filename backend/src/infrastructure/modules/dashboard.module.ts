import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { RemindersModule } from './reminders.module.js';
import { ProjectsModule } from './projects.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { NotesModule } from './notes.module.js';
import { EnvModule } from './env.module.js';

import { BuildDashboardUseCase, LogApplicationAccessUseCase, GetProductivityInsightsRawUseCase } from '../../application/use-cases/index.js';
import { DashboardController, ApplicationAccessController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    RemindersModule,
    ProjectsModule,
    WorkspacesModule,
    NotesModule,
    EnvModule,
  ],
  controllers: [
    DashboardController,
    ApplicationAccessController,
  ],
  providers: [
    BuildDashboardUseCase,
    LogApplicationAccessUseCase,
    GetProductivityInsightsRawUseCase,
  ],
})
export class DashboardModule {}
