import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';

import { ExternalIdentityRepository } from '../../../application/ports/repositories.js';
import {
  BuildReminderDispatchUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessConversationUseCase,
  QueryKnowledgeUseCase,
  RunOnboardingUseCase,
} from '../../../application/use-cases/index.js';
import { InternalServiceTokenGuard } from '../auth.guards.js';
import {
  internalN8nConversationBodySchema,
  internalN8nIngestBodySchema,
  internalN8nMarkSentBodySchema,
  internalN8nOnboardingBodySchema,
  internalN8nQueryBodySchema,
  internalReminderDispatchQuerySchema,
  resolveExternalIdentityLookup,
  type ExternalIdentityLookup,
  type InternalN8nConversationBody,
  type InternalN8nIngestBody,
  type InternalN8nMarkSentBody,
  type InternalN8nOnboardingBody,
  type InternalN8nQueryBody,
  type InternalReminderDispatchQuery,
} from '../dto/internal-n8n.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/internal/n8n')
@UseGuards(InternalServiceTokenGuard)
export class InternalN8nController {
  constructor(
    private readonly ingestEntry: IngestEntryUseCase,
    private readonly onboarding: RunOnboardingUseCase,
    private readonly conversation: ProcessConversationUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
    private readonly reminderDispatch: BuildReminderDispatchUseCase,
    private readonly markReminders: MarkReminderAsSentUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
  ) {}

  @Post('ingest')
  async ingest(@Body(new ZodValidationPipe(internalN8nIngestBodySchema, 'invalid_internal_ingest_payload')) body: InternalN8nIngestBody) {
    const tenant = await this.resolveTenant(body);
    return this.ingestEntry.execute(body.payload || body, tenant.userId, tenant.workspaceSlug);
  }

  @Post('onboarding')
  async onboardingPost(@Body(new ZodValidationPipe(internalN8nOnboardingBodySchema, 'invalid_internal_onboarding_payload')) body: InternalN8nOnboardingBody) {
    const tenant = await this.resolveTenant(body);
    return this.onboarding.execute(body.payload || body, tenant.userId);
  }

  @Post('query')
  async query(@Body(new ZodValidationPipe(internalN8nQueryBodySchema, 'invalid_internal_query_payload')) body: InternalN8nQueryBody) {
    const tenant = await this.resolveTenant(body);
    return this.queryKnowledge.execute(body.payload || body, tenant.userId);
  }

  @Post('conversation')
  async conversationPost(@Body(new ZodValidationPipe(internalN8nConversationBodySchema, 'invalid_internal_conversation_payload')) body: InternalN8nConversationBody) {
    const tenant = await this.resolveTenant(body);
    return this.conversation.execute(body.payload || body, tenant.userId, tenant.workspaceSlug);
  }

  @Get('reminders/dispatch')
  async remindersDispatch(@Query(new ZodValidationPipe(internalReminderDispatchQuerySchema, 'invalid_internal_reminder_dispatch_query')) query: InternalReminderDispatchQuery) {
    const tenant = await this.resolveExternalIdentity(query);
    return this.reminderDispatch.execute(query.mode, tenant.userId, tenant.workspaceSlug);
  }

  @Post('reminders/mark-sent')
  async remindersMarkSent(@Body(new ZodValidationPipe(internalN8nMarkSentBodySchema, 'invalid_internal_mark_reminders_payload')) body: InternalN8nMarkSentBody) {
    const tenant = await this.resolveTenant(body);
    const payload = body.payload || body;
    return this.markReminders.execute(payload.ids, tenant.userId, tenant.workspaceSlug);
  }

  private async resolveTenant(body: Parameters<typeof resolveExternalIdentityLookup>[0]) {
    return this.resolveExternalIdentity(resolveExternalIdentityLookup(body));
  }

  private async resolveExternalIdentity(input: ExternalIdentityLookup) {
    if (!input.externalId) throw new NotFoundException('external_identity_required');
    const identity = await this.externalIdentities.findExternalIdentity(input.provider, input.identityType, input.externalId);
    if (!identity) throw new NotFoundException('identity_not_found');
    const requestedWorkspace = String(input.workspaceSlug || '').trim();
    if (requestedWorkspace && requestedWorkspace !== identity.workspaceSlug) throw new NotFoundException('identity_not_found');
    return { userId: identity.userId, workspaceSlug: identity.workspaceSlug };
  }
}
