import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import {
  BuildReminderDispatchUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessAgentConversationUseCase,
  ReindexAllEmbeddingsUseCase,
} from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  agentConversationBodySchema,
  ingestBodySchema,
  reminderDispatchQuerySchema,
  workspaceQuerySchema,
  type AgentConversationBody,
  type IngestBody,
  type ReminderDispatchQuery,
  type WorkspaceQuery,
} from '../dto/operations.dto.js';
import { markRemindersBodySchema, type MarkRemindersBody } from '../dto/query.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class OperationsController {
  constructor(
    private readonly ingestEntry: IngestEntryUseCase,
    private readonly agentConversation: ProcessAgentConversationUseCase,
    private readonly reminderDispatch: BuildReminderDispatchUseCase,
    private readonly markReminders: MarkReminderAsSentUseCase,
    private readonly reindexEmbeddings: ReindexAllEmbeddingsUseCase,
  ) {}

  @Post('ingest')
  @UseGuards(TrustedOriginGuard)
  ingest(@Body(new ZodValidationPipe(ingestBodySchema, 'invalid_ingest_payload')) body: IngestBody, @CurrentUser() user: AuthenticatedUser) {
    return this.ingestEntry.execute(body, user.id);
  }

  @Post('conversation/agent')
  @UseGuards(TrustedOriginGuard)
  processAgentConversation(
    @Body(new ZodValidationPipe(agentConversationBodySchema, 'invalid_agent_conversation_payload')) body: AgentConversationBody,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.agentConversation.execute(body, user.id, query.workspaceSlug);
  }

  @Get('reminders/dispatch')
  remindersDispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reminderDispatchQuerySchema, 'invalid_reminder_dispatch_query')) query: ReminderDispatchQuery,
  ) {
    return this.reminderDispatch.execute(query.mode, user.id, query.workspaceSlug);
  }

  @Post('reminders/mark-sent')
  @UseGuards(TrustedOriginGuard)
  remindersMarkSent(
    @Body(new ZodValidationPipe(markRemindersBodySchema, 'invalid_mark_reminders_payload')) body: MarkRemindersBody,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.markReminders.execute(body.ids, user.id, query.workspaceSlug);
  }

  @Post('operations/reindex-embeddings')
  @UseGuards(TrustedOriginGuard)
  reindexAllEmbeddings(@CurrentUser() user: AuthenticatedUser) {
    return this.reindexEmbeddings.execute(user.id);
  }
}
