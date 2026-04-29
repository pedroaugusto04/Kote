import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { readEnvironment } from '../../../../adapters/environment.js';
import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { conversationInputSchema } from '../../../../contracts/conversation.js';
import { extractWhatsappConnectionCode, IntegrationConnectionService } from '../../../integration-connections.js';
import type { WhatsappWebhookRequest } from '../../../models/webhook-request.models.js';
import { ExternalIdentityRepository } from '../../../ports/integrations.repository.js';
import { WebhookEventRepository } from '../../../ports/webhook-events.repository.js';
import { WhatsappReplySender } from '../../../ports/whatsapp-reply.sender.js';
import { extractWhatsappExternalId, normalizeHeaders, parseWhatsappEvolutionMessage } from '../../../utils/webhook.utils.js';
import { ProcessConversationUseCase } from '../../conversation/process-conversation.use-case.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';
import type { IngestPayload } from '../../../../contracts/ingest.js';

@Injectable()
export class HandleWhatsappWebhookUseCase {
  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly connections?: IntegrationConnectionService,
    private readonly processConversationUseCase?: ProcessConversationUseCase,
    private readonly whatsappReplySender?: WhatsappReplySender,
  ) {}

  async execute(input: WhatsappWebhookRequest) {
    const environment = readEnvironment();
    const headers = normalizeHeaders(input.headers || {});
    const body = input.body || {};
    const token = String(headers.authorization || '').startsWith('Bearer ')
      ? String(headers.authorization).slice('Bearer '.length)
      : String(headers['x-kb-webhook-token'] || '');
    const externalId = extractWhatsappExternalId(body);
    const externalIdentity = { provider: ExternalIdentityProvider.Whatsapp, identityType: 'jid', externalId };
    if (!environment.webhookSecret || token !== environment.webhookSecret) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'invalid_webhook_token',
      });
      throw new UnauthorizedException('invalid_webhook_token');
    }
    const parsedMessage = parseWhatsappEvolutionMessage(body);
    if (Number(body.schemaVersion) !== 1 && parsedMessage.kind === 'ignored') {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Processed,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return { ok: true, processed: false, ignored: parsedMessage.reason };
    }
    if (Number(body.schemaVersion) !== 1 && parsedMessage.kind === 'message' && (!parsedMessage.isGroup || parsedMessage.fromMe)) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Processed,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return { ok: true, processed: false, ignored: parsedMessage.fromMe ? 'from_me' : 'not_group' };
    }
    if (!externalId) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'missing_external_identity',
      });
      throw new UnauthorizedException('missing_external_identity');
    }
    const connectionCode = extractWhatsappConnectionCode(body);
    if (connectionCode && this.connections) {
      const result = await this.connections.completeWhatsappFromWebhook({ code: connectionCode, groupJid: externalId });
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'connection',
        status: WebhookEventStatus.Processed,
        resolvedUserId: result.resolvedUserId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return { ok: true, connected: true, resolvedUserId: result.resolvedUserId, workspaceSlug: result.workspaceSlug };
    }
    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.Whatsapp, 'jid', externalId);
    if (!identity) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'identity_not_found',
      });
      throw new NotFoundException('identity_not_found');
    }
    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.Whatsapp,
      eventType: 'message',
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
      externalIdentity,
      rawHeaders: headers,
      rawPayload: body,
    });
    try {
      if (Number(body.schemaVersion) !== 1) {
        if (parsedMessage.kind === 'message' && this.processConversationUseCase) {
          if (!parsedMessage.messageText && parsedMessage.hasMedia) {
            const replyText = 'Recebi a midia, mas ainda nao baixo anexos nesta versao. Envie uma legenda ou texto para salvar como nota.';
            const sendResult = this.whatsappReplySender
              ? await this.whatsappReplySender.sendText({ groupJid: parsedMessage.groupId, text: replyText })
              : { ok: false, error: 'whatsapp_reply_sender_not_configured' };
            await this.webhookEvents.recordWebhookEvent({
              provider: IntegrationProvider.Whatsapp,
              eventType: 'message',
              status: WebhookEventStatus.Processed,
              resolvedUserId: identity.userId,
              externalIdentity,
              rawHeaders: headers,
              rawPayload: body,
            });
            return {
              ok: true,
              processed: true,
              action: 'reply',
              replyText,
              replySent: sendResult.ok,
              replyError: sendResult.ok ? undefined : sendResult.error,
            };
          }

          const conversationResult = await this.processConversationUseCase.execute(
            conversationInputSchema.parse({
              messageText: parsedMessage.messageText,
              senderId: parsedMessage.senderId,
              groupId: parsedMessage.groupId,
              messageId: parsedMessage.messageId,
              hasMedia: parsedMessage.hasMedia,
              media: {},
            }),
            identity.userId,
            identity.workspaceSlug,
          );
          const shouldReply = conversationResult.action === 'reply' || conversationResult.action === 'submit';
          const sendResult = shouldReply && this.whatsappReplySender
            ? await this.whatsappReplySender.sendText({ groupJid: parsedMessage.groupId, text: conversationResult.replyText })
            : shouldReply
              ? { ok: false, error: 'whatsapp_reply_sender_not_configured' }
              : { ok: false, error: 'reply_not_needed' };
          await this.webhookEvents.recordWebhookEvent({
            provider: IntegrationProvider.Whatsapp,
            eventType: 'message',
            status: WebhookEventStatus.Processed,
            resolvedUserId: identity.userId,
            externalIdentity,
            rawHeaders: headers,
            rawPayload: body,
          });
          return {
            ok: true,
            processed: true,
            conversationResult,
            replySent: shouldReply ? sendResult.ok : false,
            replyError: shouldReply && !sendResult.ok ? sendResult.error : undefined,
          };
        }
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.Whatsapp,
          eventType: 'message',
          status: WebhookEventStatus.Processed,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload: body,
        });
        return { ok: true, resolvedUserId: identity.userId, processed: false };
      }
      const ingestResult = await this.ingestEntryUseCase.execute(body as IngestPayload, identity.userId, identity.workspaceSlug);
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Processed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return { ok: true, ingestResult };
    } catch (error) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Whatsapp,
        eventType: 'message',
        status: WebhookEventStatus.Failed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
