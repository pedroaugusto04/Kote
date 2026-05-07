import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import { IntegrationConnectionService } from '../../../integration-connections.js';
import type { WhatsappWebhookRequest } from '../../../models/webhook-request.models.js';
import { ExternalIdentityRepository } from '../../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhook-events.repository.js';
import { WhatsappReplySender } from '../../../ports/whatsapp-reply.sender.js';
import { buildWhatsappWebhookCommand } from '../../../utils/whatsapp-webhook-command.utils.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { ProcessConversationUseCase } from '../../conversation/process-conversation.use-case.js';
import { AppLogger } from '../../../../observability/logger.js';

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
    private readonly logger?: AppLogger,
    private readonly connections?: IntegrationConnectionService,
    private readonly processConversationUseCase?: ProcessConversationUseCase,
    private readonly whatsappReplySender?: WhatsappReplySender,
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
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
    });

    try {
      return this.handleEvolutionMessage(context, identity.userId, identity.workspaceSlug, command.input);
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
    const validEvolutionApiKey = Boolean(environment.evolutionApiKey) && evolutionApiKey === environment.evolutionApiKey;
    if (!validEvolutionApiKey) {
      this.logger?.warn('whatsapp.webhook.auth_failed', {
        receivedMask: maskSecret(evolutionApiKey),
        expectedMask: maskSecret(environment.evolutionApiKey),
        bodyKeyPresent: Boolean(context.body.apikey),
        headerKeyPresent: Boolean(context.headers.apikey),
        event: String(context.body.event || ''),
        instance: String(context.body.instance || ''),
        bodyKeys: Object.keys(context.body || {}),
      });
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
    if (!this.processConversationUseCase) {
      return this.processed(context, { ok: true, resolvedUserId: userId, processed: false }, userId);
    }
    if (!input.messageText && input.hasMedia) {
      const replyText = 'Recebi a midia, mas ainda nao baixo anexos nesta versao. Envie uma legenda ou texto para salvar como nota.';
      const sendResult = await this.sendReply(input.groupId, replyText);
      return this.processed(context, {
        ok: true,
        processed: true,
        action: 'reply',
        replyText,
        replySent: sendResult.ok,
        replyError: sendResult.ok ? undefined : sendResult.error,
      }, userId);
    }

    const conversationResult = await this.processConversationUseCase.execute(
      input,
      userId,
      workspaceSlug,
    );
    const shouldReply = conversationResult.action === 'reply' || conversationResult.action === 'submit';
    const sendResult = shouldReply
      ? await this.sendReply(input.groupId, conversationResult.replyText)
      : { ok: false as const, error: 'reply_not_needed' };
    return this.processed(context, {
      ok: true,
      processed: true,
      conversationResult,
      replySent: shouldReply ? sendResult.ok : false,
      replyError: shouldReply && !sendResult.ok ? sendResult.error : undefined,
    }, userId);
  }

  private async sendReply(groupJid: string, text: string) {
    if (!this.whatsappReplySender) return { ok: false as const, error: 'whatsapp_reply_sender_not_configured' };
    return this.whatsappReplySender.sendText({ groupJid, text });
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

function maskSecret(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return '[empty]';
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}...${normalized.length}`;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)} (len=${normalized.length})`;
}
