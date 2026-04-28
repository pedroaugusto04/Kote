import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import {
  BuildReminderDispatchUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessConversationUseCase,
  RunOnboardingUseCase,
} from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  conversationBodySchema,
  ingestBodySchema,
  onboardingBodySchema,
  reminderDispatchQuerySchema,
  workspaceQuerySchema,
  type ConversationBody,
  type IngestBody,
  type OnboardingBody,
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
    private readonly onboarding: RunOnboardingUseCase,
    private readonly conversation: ProcessConversationUseCase,
    private readonly reminderDispatch: BuildReminderDispatchUseCase,
    private readonly markReminders: MarkReminderAsSentUseCase,
  ) {}

  @Post('ingest')
  @UseGuards(TrustedOriginGuard)
  ingest(@Body(new ZodValidationPipe(ingestBodySchema, 'invalid_ingest_payload')) body: IngestBody, @CurrentUser() user: AuthenticatedUser) {
    return this.ingestEntry.execute(body, user.id);
  }

  @Post('onboarding')
  @UseGuards(TrustedOriginGuard)
  runOnboarding(@Body(new ZodValidationPipe(onboardingBodySchema, 'invalid_onboarding_payload')) body: OnboardingBody, @CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.execute(body, user.id);
  }

  @Post('conversation')
  @UseGuards(TrustedOriginGuard)
  processConversation(
    @Body(new ZodValidationPipe(conversationBodySchema, 'invalid_conversation_payload')) body: ConversationBody,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.conversation.execute(body, user.id, query.workspaceSlug);
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
}
