import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { AiModule } from './ai.module.js';
import { QueueModule } from './queue.module.js';
import { NotesModule } from './notes.module.js';
import { RemindersModule } from './reminders.module.js';
import { ProjectsModule } from './projects.module.js';

import {
  ProcessAgentConversationUseCase,
} from '../../application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { OperationsController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    AuthModule,
    AiModule,
    QueueModule,
    NotesModule,
    RemindersModule,
    ProjectsModule,
  ],
  controllers: [
    OperationsController,
  ],
  providers: [
    ProcessAgentConversationUseCase,
    ConversationAgentPresenter,
    ConversationFolderResolutionService,
  ],
  exports: [
    ProcessAgentConversationUseCase,
  ],
})
export class OperationsModule {}
