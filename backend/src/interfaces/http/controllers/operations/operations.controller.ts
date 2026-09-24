import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  BuildReminderDispatchUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessAgentConversationUseCase,
  ReindexAllEmbeddingsUseCase,
  ExportGlobalUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { WorkspaceResolutionGuard } from '../../guards/workspace-resolution.guard.js';
import { OptionalProjectResolutionGuard } from '../../guards/project-resolution.guard.js';
import {
  agentConversationBodySchema,
  ingestBodySchema,
  reminderDispatchQuerySchema,
  workspaceQuerySchema,
  type AgentConversationBody,
  type IngestBody,
  type ReminderDispatchQuery,
  type WorkspaceQuery,
} from '../../dto/operations.dto.js';
import { markRemindersBodySchema, type MarkRemindersBody } from '../../dto/query.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Operations')
@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class OperationsController {
  constructor(
    private readonly ingestEntry: IngestEntryUseCase,
    private readonly agentConversation: ProcessAgentConversationUseCase,
    private readonly reminderDispatch: BuildReminderDispatchUseCase,
    private readonly markReminders: MarkReminderAsSentUseCase,
    private readonly reindexEmbeddings: ReindexAllEmbeddingsUseCase,
    private readonly exportGlobal: ExportGlobalUseCase,
  ) {}

  @Post('ingest')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingest content into Kote' })
  @ApiResponse({ status: 200, description: 'Content ingested successfully' })
  ingest(@Body(new ZodValidationPipe(ingestBodySchema, 'invalid_ingest_payload')) body: IngestBody, @CurrentUser() user: AuthenticatedUser) {
    return this.ingestEntry.execute(body, user.id);
  }

  @Post('conversation/agent')
  @UseGuards(TrustedOriginGuard, OptionalProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process agent conversation' })
  @ApiResponse({ status: 200, description: 'Conversation processed successfully' })
  processAgentConversation(
    @Body(new ZodValidationPipe(agentConversationBodySchema, 'invalid_agent_conversation_payload')) body: AgentConversationBody,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.agentConversation.execute(body, user.id, query.workspaceSlug, query.projectSlug);
  }

  @Get('reminders/dispatch')
  @UseGuards(WorkspaceResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reminder dispatch' })
  @ApiResponse({ status: 200, description: 'Reminder dispatch retrieved successfully' })
  remindersDispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reminderDispatchQuerySchema, 'invalid_reminder_dispatch_query')) query: ReminderDispatchQuery,
  ) {
    return this.reminderDispatch.execute(query.mode, user.id, query.workspaceSlug);
  }

  @Post('reminders/mark-sent')
  @UseGuards(TrustedOriginGuard, WorkspaceResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark reminders as sent' })
  @ApiResponse({ status: 200, description: 'Reminders marked as sent' })
  remindersMarkSent(
    @Body(new ZodValidationPipe(markRemindersBodySchema, 'invalid_mark_reminders_payload')) body: MarkRemindersBody,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.markReminders.execute(body.ids, user.id, query.workspaceSlug);
  }

  @Post('operations/reindex-embeddings')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reindex all embeddings' })
  @ApiResponse({ status: 200, description: 'Embeddings reindexed successfully' })
  reindexAllEmbeddings(@CurrentUser() user: AuthenticatedUser) {
    return this.reindexEmbeddings.execute(user.id);
  }

  @Get('export/global')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the account knowledge and structure as a ZIP file' })
  @ApiResponse({ status: 200, description: 'Global Kote portability export' })
  async exportGlobalData(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const result = await this.exportGlobal.execute(user.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  }
}
