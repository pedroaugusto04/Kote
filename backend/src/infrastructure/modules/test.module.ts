import { Module } from '@nestjs/common';

import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { EmailModule } from './email.module.js';
import { WeeklySummaryModule } from './weekly-summary.module.js';

import { TestEmailController } from '../../interfaces/http/controllers/test-email/test-email.controller.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    EmailModule,
    WeeklySummaryModule,
  ],
  controllers: [TestEmailController],
})
export class TestModule {}
