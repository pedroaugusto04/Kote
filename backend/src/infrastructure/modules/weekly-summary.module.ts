import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { EmailModule } from './email.module.js';
import { AiModule } from './ai.module.js';
import { IntegrationsModule } from './integrations.module.js';

import { WeeklySummaryService } from '../../application/services/weekly-summary.service.js';
import { WeeklySummaryWorker } from '../../application/services/workers/weekly-summary.worker.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    EmailModule,
    AiModule,
    IntegrationsModule,
  ],
  providers: [
    WeeklySummaryService,
    WeeklySummaryWorker,
  ],
  exports: [
    WeeklySummaryService,
    WeeklySummaryWorker,
  ],
})
export class WeeklySummaryModule {}
