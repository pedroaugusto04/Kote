import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';

import { ExternalIdentityRepository } from '../../../../application/ports/integrations/integrations.repository.js';
import {
  BuildReminderDispatchUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessAgentConversationUseCase,
  QueryKnowledgeUseCase,
} from '../../../../application/use-cases/index.js';
import { InternalServiceTokenGuard } from '../../auth.guards.js';
import {
  internalN8nAgentConversationBodySchema,
  internalN8nIngestBodySchema,
  internalN8nMarkSentBodySchema,
  internalN8nQueryBodySchema,
  internalReminderDispatchQuerySchema,
  resolveExternalIdentityLookup,
  type ExternalIdentityLookup,
  type InternalN8nAgentConversationBody,
  type InternalN8nIngestBody,
  type InternalN8nMarkSentBody,
  type InternalN8nQueryBody,
  type InternalReminderDispatchQuery,
} from '../../dto/internal-n8n.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@Controller('api/internal/n8n')
@UseGuards(InternalServiceTokenGuard)
export class InternalN8NController {
  constructor(
    private readonly ingestEntry: IngestEntryUseCase,
    private readonly agentConversation: ProcessAgentConversationUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
    private readonly reminderDispatch: BuildReminderDispatchUseCase,
    private readonly markReminders: MarkReminderAsSentUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
  ) {}

  @Post('ingest')
  async ingest(@Body(new ZodValidationPipe(internalN8nIngestBodySchema, 'invalid_internal_ingest_payload')) body: InternalN8nIngestBody) {
    const tenant = await this.resolveTenant(body);
    return this.ingestEntry.execute(body.payload, tenant.userId, tenant.workspaceSlug);
  }

  @Post('query')
  async query(@Body(new ZodValidationPipe(internalN8nQueryBodySchema, 'invalid_internal_query_payload')) body: InternalN8nQueryBody) {
    const tenant = await this.resolveTenant(body);
    return this.queryKnowledge.execute(body.payload, tenant.userId);
  }

  @Post('conversation/agent')
  async agentConversationPost(@Body(new ZodValidationPipe(internalN8nAgentConversationBodySchema, 'invalid_internal_agent_conversation_payload')) body: InternalN8nAgentConversationBody) {
    const tenant = await this.resolveTenant(body);
    return this.agentConversation.execute(body.payload, tenant.userId, tenant.workspaceSlug);
  }

  @Get('reminders/dispatch')
  async remindersDispatch(@Query(new ZodValidationPipe(internalReminderDispatchQuerySchema, 'invalid_internal_reminder_dispatch_query')) query: InternalReminderDispatchQuery) {
    const tenant = await this.resolveExternalIdentity(query);
    const result = await this.reminderDispatch.execute(query.mode, tenant.userId, tenant.workspaceSlug);
    return {
      ...result,
      provider: query.provider,
      identityType: query.identityType,
      externalId: query.externalId,
      workspaceSlug: tenant.workspaceSlug,
      mode: query.mode,
    };
  }

  @Post('reminders/mark-sent')
  async remindersMarkSent(@Body(new ZodValidationPipe(internalN8nMarkSentBodySchema, 'invalid_internal_mark_reminders_payload')) body: InternalN8nMarkSentBody) {
    const tenant = await this.resolveTenant(body);
    return this.markReminders.execute(body.payload.ids, tenant.userId, tenant.workspaceSlug, body.payload.mode, body.payload.dispatchKey);
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
