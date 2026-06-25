import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { StorageModule } from './storage.module.js';
import { QueueModule } from './queue.module.js';
import { AiModule } from './ai.module.js';
import { RemindersModule } from './reminders.module.js';
import { ProjectsModule } from './projects.module.js';
import { QuotaModule } from './quota.module.js';

import {
  ListPaginatedNotesUseCase,
  CreateManualNoteUseCase,
  UpdateNoteUseCase,
  DeleteNoteUseCase,
  GetNoteAttachmentContentUseCase,
  GetNoteDetailUseCase,
  ReindexAllEmbeddingsUseCase,
  AskKnowledgeUseCase,
  ResolveWhatsappAskAttachmentsUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
  SetNotePinnedUseCase,
  FindRelatedNotesUseCase,
  IngestEntryUseCase,
  QueryKnowledgeUseCase,
  GetAutoActionGlobalUseCase,
  SetAutoActionGlobalUseCase,
} from '../../application/use-cases/index.js';
import { EmbeddingWorker } from '../../application/services/embedding.worker.js';
import { NoteChunkingService } from '../../application/services/note-chunking.service.js';
import { NoteEventDispatcher } from '../../application/services/note-event-dispatcher.js';
import { AutoActionWorker } from '../../workers/auto-action.worker.js';
import { PostgresSettingsRepository } from '../repositories/settings.repository.js';
import { SettingsRepository } from '../../application/ports/settings.repository.js';
import { NotesController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    AuthModule,
    StorageModule,
    QueueModule,
    AiModule,
    RemindersModule,
    ProjectsModule,
    QuotaModule,
  ],
  controllers: [
    NotesController,
  ],
  providers: [
    ListPaginatedNotesUseCase,
    CreateManualNoteUseCase,
    UpdateNoteUseCase,
    DeleteNoteUseCase,
    GetNoteAttachmentContentUseCase,
    GetNoteDetailUseCase,
    EmbeddingWorker,
    NoteChunkingService,
    ReindexAllEmbeddingsUseCase,
    NoteEventDispatcher,
    AutoActionWorker,
    
    GetAutoActionGlobalUseCase,
    SetAutoActionGlobalUseCase,
    AskKnowledgeUseCase,
    ResolveWhatsappAskAttachmentsUseCase,
    RunAskAiUseCase,
    ListAskHistoryUseCase,
    SetNotePinnedUseCase,
    FindRelatedNotesUseCase,
    IngestEntryUseCase,
    QueryKnowledgeUseCase,
  ],
  exports: [
    EmbeddingWorker,
    NoteChunkingService,
    NoteEventDispatcher,
    AskKnowledgeUseCase,
    ResolveWhatsappAskAttachmentsUseCase,
    RunAskAiUseCase,
    CreateManualNoteUseCase,
    UpdateNoteUseCase,
    DeleteNoteUseCase,
    ListPaginatedNotesUseCase,
    IngestEntryUseCase,
    QueryKnowledgeUseCase,
    GetNoteDetailUseCase,
    ListAskHistoryUseCase,
    ReindexAllEmbeddingsUseCase,
  ],
})
export class NotesModule {}
