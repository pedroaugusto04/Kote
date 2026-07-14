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
  BulkUpdateNoteStatusUseCase,
  DeleteNoteUseCase,
  GetNoteAttachmentContentUseCase,
  GetNoteDetailUseCase,
  ReindexAllEmbeddingsUseCase,
  AskKnowledgeUseCase,
  ResolveWhatsappAskAttachmentsUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
  ListAskConversationsUseCase,
  GetAskConversationTurnsUseCase,
  SetNotePinnedUseCase,
  FindRelatedNotesUseCase,
  FindNotesByFileUseCase,
  FindRelatedNotesByFileUseCase,
  GenerateFileNotesSummaryUseCase,
  IngestEntryUseCase,
  QueryKnowledgeUseCase,
  GetAutoActionGlobalUseCase,
  SetAutoActionGlobalUseCase,
} from '../../application/use-cases/index.js';
import { EmbeddingWorker } from '../../application/workers/embedding.worker.js';
import { NoteChunkingService } from '../../application/services/content/note-chunking.service.js';
import { NoteEventDispatcher } from '../../application/services/webhooks/note-event-dispatcher.js';
import { NoteLifecycleService } from '../../application/services/content/note-lifecycle.service.js';
import { FileNotesSummaryCacheService } from '../../application/services/content/file-notes-summary-cache.service.js';
import { AutoActionWorker } from '../../application/workers/auto-action.worker.js';
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
    BulkUpdateNoteStatusUseCase,
    DeleteNoteUseCase,
    GetNoteAttachmentContentUseCase,
    GetNoteDetailUseCase,
    EmbeddingWorker,
    NoteChunkingService,
    ReindexAllEmbeddingsUseCase,
    NoteEventDispatcher,
    NoteLifecycleService,
    FileNotesSummaryCacheService,
    AutoActionWorker,
    
    GetAutoActionGlobalUseCase,
    SetAutoActionGlobalUseCase,
    AskKnowledgeUseCase,
    ResolveWhatsappAskAttachmentsUseCase,
    RunAskAiUseCase,
    ListAskHistoryUseCase,
    ListAskConversationsUseCase,
    GetAskConversationTurnsUseCase,
    SetNotePinnedUseCase,
    FindRelatedNotesUseCase,
    FindNotesByFileUseCase,
    FindRelatedNotesByFileUseCase,
    GenerateFileNotesSummaryUseCase,
    IngestEntryUseCase,
    QueryKnowledgeUseCase,
    PostgresSettingsRepository,
    { provide: SettingsRepository, useExisting: PostgresSettingsRepository },
  ],
  exports: [
    EmbeddingWorker,
    NoteChunkingService,
    NoteEventDispatcher,
    NoteLifecycleService,
    AskKnowledgeUseCase,
    ResolveWhatsappAskAttachmentsUseCase,
    RunAskAiUseCase,
    CreateManualNoteUseCase,
    UpdateNoteUseCase,
    BulkUpdateNoteStatusUseCase,
    DeleteNoteUseCase,
    ListPaginatedNotesUseCase,
    IngestEntryUseCase,
    QueryKnowledgeUseCase,
    GetNoteDetailUseCase,
    ListAskHistoryUseCase,
    ListAskConversationsUseCase,
    GetAskConversationTurnsUseCase,
    ReindexAllEmbeddingsUseCase,
    FindNotesByFileUseCase,
    FindRelatedNotesByFileUseCase,
  ],
})
export class NotesModule {}
