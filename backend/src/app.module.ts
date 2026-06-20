import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { LoggerModule } from './infrastructure/modules/logger.module.js';
import { EnvModule } from './infrastructure/modules/env.module.js';
import { DatabaseModule } from './infrastructure/modules/database.module.js';
import { AiModule } from './infrastructure/modules/ai.module.js';
import { StorageModule } from './infrastructure/modules/storage.module.js';
import { QueueModule } from './infrastructure/modules/queue.module.js';
import { AuthModule } from './infrastructure/modules/auth.module.js';
import { DashboardModule } from './infrastructure/modules/dashboard.module.js';
import { NotesModule } from './infrastructure/modules/notes.module.js';
import { ProjectsModule } from './infrastructure/modules/projects.module.js';
import { WorkspacesModule } from './infrastructure/modules/workspaces.module.js';
import { RemindersModule } from './infrastructure/modules/reminders.module.js';
import { PushSubscriptionsModule } from './infrastructure/modules/push-subscriptions.module.js';
import { OperationsModule } from './infrastructure/modules/operations.module.js';
import { IntegrationsModule } from './infrastructure/modules/integrations.module.js';
import { QuotaModule } from './infrastructure/modules/quota.module.js';
import { BillingModule } from './infrastructure/modules/billing.module.js';

import { HealthController } from './interfaces/http/controllers/index.js';
import { GlobalRateLimitGuard } from './interfaces/http/auth.guards.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    AiModule,
    StorageModule,
    QueueModule,
    AuthModule,
    DashboardModule,
    NotesModule,
    ProjectsModule,
    WorkspacesModule,
    RemindersModule,
    PushSubscriptionsModule,
    OperationsModule,
    IntegrationsModule,
    QuotaModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule {}
