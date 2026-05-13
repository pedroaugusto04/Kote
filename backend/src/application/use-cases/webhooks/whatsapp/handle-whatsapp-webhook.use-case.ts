import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import { DEFAULT_PAGE_SIZE } from '../../../../contracts/pagination.js';
import { IntegrationConnectionService } from '../../../integration-connections.js';
import type { WhatsappWebhookRequest } from '../../../models/webhook-request.models.js';
import { ExternalIdentityRepository } from '../../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhook-events.repository.js';
import { WhatsappReplySender } from '../../../ports/whatsapp-reply.sender.js';
import { buildWhatsappWebhookCommand } from '../../../utils/whatsapp-webhook-command.utils.js';
import { parseKnowledgeCommand } from '../../../utils/conversation-flow.utils.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { ProcessAgentConversationUseCase } from '../../conversation/process-agent-conversation.use-case.js';
import { QueryKnowledgeUseCase } from '../../query/query-knowledge.use-case.js';
import { AppLogger } from '../../../../observability/logger.js';
import { parseWhatsappEvolutionMessage } from '../../../utils/webhook.utils.js';

type WhatsappWebhookContext = {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  externalIdentity: { provider: ExternalIdentityProvider.Whatsapp; identityType: 'jid'; externalId: string };
};

@Injectable()
export class HandleWhatsappWebhookUseCase {
  constructor(
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly connections?: IntegrationConnectionService,
    private readonly processAgentConversationUseCase?: ProcessAgentConversationUseCase,
    private readonly queryKnowledgeUseCase?: QueryKnowledgeUseCase,
    private readonly whatsappReplySender?: WhatsappReplySender,
    private readonly logger?: AppLogger,
  ) {}

  async execute(input: WhatsappWebhookRequest) {
    const context = this.buildContext(input);
    await this.assertWebhookToken(context);
    const command = buildWhatsappWebhookCommand(context.body);
    if (command.kind === 'ignore') {
      return this.processed(context, { ok: true, processed: false, ignored: command.reason });
    }
    if (command.kind === 'reject') {
      await this.rejected(context, command.reason);
      throw new UnauthorizedException(command.reason);
    }
    context.externalIdentity.externalId = command.externalId;

    if (command.kind === 'connect') {
      const claimed = await this.claimMessageIdempotency(context, 'connection');
      if (!claimed) {
        return this.processed(context, { ok: true, processed: false, ignored: 'duplicate_message' });
      }
      if (!this.connections) {
        return this.processed(context, { ok: true, processed: false, ignored: 'connection_service_unavailable' });
      }
      const result = await this.connections.completeWhatsappFromWebhook({ code: command.code, groupJid: command.externalId });
      await this.recordWebhookEvent(context, {
        eventType: 'connection',
        status: WebhookEventStatus.Processed,
        resolvedUserId: result.resolvedUserId,
      });
      return { ok: true, connected: true, resolvedUserId: result.resolvedUserId, workspaceSlug: result.workspaceSlug };
    }

    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.Whatsapp, 'jid', command.externalId);
    if (!identity) {
      await this.rejected(context, 'identity_not_found');
      throw new NotFoundException('identity_not_found');
    }
    const claimed = await this.claimMessageIdempotency(context, 'message', identity.userId);
    if (!claimed) {
      return this.processed(context, { ok: true, processed: false, ignored: 'duplicate_message' }, identity.userId);
    }
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
    });

    try {
      return await this.handleEvolutionMessage(context, identity.userId, identity.workspaceSlug, command.input);
    } catch (error) {
      await this.failed(context, identity.userId, error);
      throw error;
    }
  }

  private buildContext(input: WhatsappWebhookRequest): WhatsappWebhookContext {
    const headers = normalizeHeaders(input.headers || {});
    const body = input.body || {};
    return {
      headers,
      body,
      externalIdentity: {
        provider: ExternalIdentityProvider.Whatsapp,
        identityType: 'jid',
        externalId: '',
      },
    };
  }

  private async assertWebhookToken(context: WhatsappWebhookContext) {
    const environment = this.environmentProvider.read();
    const evolutionApiKey = String(context.headers.apikey || context.body.apikey || '').trim();
    const validWebhookApiKey = Boolean(environment.whatsappWebhookApiKey) && evolutionApiKey === environment.whatsappWebhookApiKey;
    if (!validWebhookApiKey) {
      await this.rejected(context, 'invalid_webhook_token');
      throw new UnauthorizedException('invalid_webhook_token');
    }
  }

  private async handleEvolutionMessage(
    context: WhatsappWebhookContext,
    userId: string,
    workspaceSlug: string,
    input: ConversationInput,
  ) {
    if (!input.messageText && input.hasMedia) {
      const replyText = 'Recebi a midia, mas ainda nao baixo anexos nesta versao. Envie uma legenda ou texto para salvar como nota.';
      const sendResult = await this.sendReply(input.groupId, replyText);
      return this.processed(context, {
        ok: true,
        processed: true,
        action: 'reply',
        message: replyText,
        replySent: sendResult.ok,
        replyError: sendResult.ok ? undefined : sendResult.error,
      }, userId);
    }

    const knowledgeCommand = parseKnowledgeCommand(input.messageText || '');
    if (knowledgeCommand) {
      return this.handleKnowledgeQuery(context, userId, workspaceSlug, input, knowledgeCommand.query);
    }

    if (!this.processAgentConversationUseCase) {
      return this.processed(context, { ok: true, resolvedUserId: userId, processed: false }, userId);
    }

    const conversationResult = await this.processAgentConversationUseCase.execute(
      input,
      userId,
      workspaceSlug,
    );
    const replyText = normalizeReplyText(conversationResult.replyText);
    this.logger?.info('whatsapp.conversation.result', {
      externalId: context.externalIdentity.externalId,
      senderId: input.senderId,
      groupId: input.groupId,
      messageId: input.messageId,
      messageText: input.messageText,
      action: conversationResult.action,
      replyText,
    });
    const shouldReply = conversationResult.action !== 'cancel';
    const sendResult = shouldReply
      ? await this.sendReply(input.groupId, replyText)
      : { ok: false as const, error: 'reply_not_needed' };
    this.logger?.info('whatsapp.reply.dispatch', {
      externalId: context.externalIdentity.externalId,
      groupId: input.groupId,
      shouldReply,
      replyText: shouldReply ? replyText : '',
      sendOk: sendResult.ok,
      sendError: sendResult.ok ? '' : sendResult.error,
    });
    return this.processed(context, {
      ok: true,
      processed: true,
      action: conversationResult.action,
      message: replyText,
      payload: conversationResult.payload ?? null,
      ingestResult: 'ingestResult' in conversationResult ? conversationResult.ingestResult : undefined,
      conversationResult: { ...conversationResult, replyText },
      replySent: shouldReply ? sendResult.ok : false,
      replyError: shouldReply && !sendResult.ok ? sendResult.error : undefined,
    }, userId);
  }

  private async handleKnowledgeQuery(
    context: WhatsappWebhookContext,
    userId: string,
    workspaceSlug: string,
    input: ConversationInput,
    query: string,
  ) {
    if (!this.queryKnowledgeUseCase) {
      return this.processed(context, { ok: true, resolvedUserId: userId, processed: false }, userId);
    }
    const result = await this.queryKnowledgeUseCase.execute({
      query,
      workspaceSlug,
      projectSlug: '',
      limit: 5,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    }, userId);
    const replyText = [
      result.answer.answer,
      '',
      ...result.answer.bullets.slice(0, 4).map((item) => `- ${item}`),
      result.matches.length ? '' : '',
      ...result.matches.slice(0, 4).map((item) => `Fonte: ${item.path}`),
    ].filter(Boolean).join('\n');
    const sendResult = await this.sendReply(input.groupId, replyText);
    return this.processed(context, {
      ok: true,
      processed: true,
      action: 'reply',
      message: replyText,
      payload: null,
      conversationResult: { action: 'reply', replyText, payload: null },
      replySent: sendResult.ok,
      replyError: sendResult.ok ? undefined : sendResult.error,
    }, userId);
  }

  private async sendReply(groupJid: string, text: string) {
    if (!this.whatsappReplySender) return { ok: false as const, error: 'whatsapp_reply_sender_not_configured' };
    return this.whatsappReplySender.sendText({ groupJid, text });
  }

  private async claimMessageIdempotency(
    context: WhatsappWebhookContext,
    eventType: 'message' | 'connection',
    resolvedUserId?: string,
  ) {
    const idempotencyKey = this.buildMessageIdempotencyKey(context);
    if (!idempotencyKey) return true;
    const claimed = await this.webhookEvents.claimWebhookIdempotency({
      provider: IntegrationProvider.Whatsapp,
      eventType,
      idempotencyKey,
      resolvedUserId,
      externalIdentity: context.externalIdentity,
      rawHeaders: context.headers,
      rawPayload: context.body,
    });
    if (!claimed) {
      this.logger?.info('whatsapp.webhook.duplicate', {
        externalId: context.externalIdentity.externalId,
        eventType,
        idempotencyKey,
      });
    }
    return claimed;
  }

  private buildMessageIdempotencyKey(context: WhatsappWebhookContext) {
    const parsedMessage = parseWhatsappEvolutionMessage(context.body);
    if (parsedMessage.kind !== 'message') return '';
    if (!parsedMessage.messageId) return '';
    return `${context.externalIdentity.externalId}:${parsedMessage.messageId}`;
  }

  private async processed<T>(context: WhatsappWebhookContext, result: T, resolvedUserId?: string) {
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Processed,
      resolvedUserId,
    });
    return result;
  }

  private async rejected(context: WhatsappWebhookContext, error: string) {
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Rejected,
      error,
    });
  }

  private async failed(context: WhatsappWebhookContext, resolvedUserId: string, error: unknown) {
    this.logger?.error('whatsapp.webhook.failed', {
      externalId: context.externalIdentity.externalId,
      resolvedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Failed,
      resolvedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private async recordWebhookEvent(
    context: WhatsappWebhookContext,
    event: {
      eventType: 'message' | 'connection';
      status: WebhookEventStatus;
      resolvedUserId?: string;
      error?: string;
    },
  ) {
    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.Whatsapp,
      eventType: event.eventType,
      status: event.status,
      resolvedUserId: event.resolvedUserId,
      externalIdentity: context.externalIdentity,
      rawHeaders: context.headers,
      rawPayload: context.body,
      error: event.error,
    });
  }
}

function normalizeReplyText(value: unknown) {
  return String(value || '').trim() || 'Nao consegui montar a resposta. Tente novamente.';
}
