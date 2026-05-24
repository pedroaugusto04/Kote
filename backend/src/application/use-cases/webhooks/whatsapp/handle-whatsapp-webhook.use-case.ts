import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import { IntegrationConnectionService } from '../../../integration-connections.js';
import type { WhatsappWebhookRequest } from '../../../models/webhook-request.models.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { WhatsappMediaDownloader } from '../../../ports/integrations/whatsapp-media.downloader.js';
import { WhatsappReplySender } from '../../../ports/integrations/whatsapp-reply.sender.js';
import { parseAskCommand } from '../../../utils/conversation-command.utils.js';
import { buildWhatsappWebhookCommand } from '../../../utils/whatsapp-webhook-command.utils.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { ProcessAgentConversationUseCase } from '../../conversation/process-agent-conversation.use-case.js';
import { AskKnowledgeUseCase } from '../../query/ask-knowledge.use-case.js';
import { ResolveWhatsappAskAttachmentsUseCase } from '../../query/resolve-whatsapp-ask-attachments.use-case.js';
import { AppLogger } from '../../../../observability/logger.js';
import { parseWhatsappEvolutionMessage } from '../../../utils/webhook.utils.js';
import { WhatsappConversationTaskQueue, WhatsappWebhookRateLimiter } from './whatsapp-webhook-flow-control.js';
import type { WhatsappAskAttachmentResolution } from '../../../models/whatsapp-ask-attachment.models.js';

type WhatsappWebhookContext = {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  externalIdentity: { provider: ExternalIdentityProvider.Whatsapp; identityType: 'jid'; externalId: string };
};

@Injectable()
export class HandleWhatsappWebhookUseCase {
  private readonly rateLimiter = new WhatsappWebhookRateLimiter();
  private readonly conversationQueue = new WhatsappConversationTaskQueue();

  constructor(
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly credentials: CredentialRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly connections?: IntegrationConnectionService,
    private readonly processAgentConversationUseCase?: ProcessAgentConversationUseCase,
    private readonly askKnowledgeUseCase?: AskKnowledgeUseCase,
    private readonly whatsappReplySender?: WhatsappReplySender,
    private readonly whatsappMediaDownloader?: WhatsappMediaDownloader,
    private readonly logger?: AppLogger,
    private readonly resolveWhatsappAskAttachmentsUseCase?: ResolveWhatsappAskAttachmentsUseCase,
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
      const result = await this.connections.completeWhatsappFromWebhook({ code: command.code, chatJid: command.externalId });
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
    const active = await this.isWhatsappIntegrationActive(identity.userId, identity.workspaceSlug);
    if (!active) {
      this.logger?.info('whatsapp.webhook.integration_inactive', {
        externalId: context.externalIdentity.externalId,
        resolvedUserId: identity.userId,
        workspaceSlug: identity.workspaceSlug,
      });
      return this.processed(context, { ok: true, processed: false, ignored: 'whatsapp_integration_inactive' }, identity.userId);
    }
    const claimed = await this.claimMessageIdempotency(context, 'message', identity.userId);
    if (!claimed) {
      return this.processed(context, { ok: true, processed: false, ignored: 'duplicate_message' }, identity.userId);
    }
    const rateLimit = this.rateLimiter.consume({
      userId: identity.userId,
      workspaceSlug: identity.workspaceSlug,
      chatId: command.input.chatId,
      senderId: command.input.senderId,
    });
    if (!rateLimit.allowed) {
      return this.handleRateLimitedMessage(context, identity.userId, command.input.chatId, rateLimit);
    }
    await this.recordWebhookEvent(context, {
      eventType: 'message',
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
    });

    try {
      return await this.conversationQueue.enqueue(
        this.conversationQueueKey(identity.userId, identity.workspaceSlug, command.input),
        () => this.handleEvolutionMessage(context, identity.userId, identity.workspaceSlug, command.input),
      );
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
    const enrichedInput = await this.withDownloadedMedia(context, input);

    const askCommand = parseAskCommand(enrichedInput.messageText || '');
    if (askCommand) {
      return this.handleAskCommand(context, userId, workspaceSlug, enrichedInput, askCommand.question);
    }

    if (!this.processAgentConversationUseCase) {
      return this.processed(context, { ok: true, resolvedUserId: userId, processed: false }, userId);
    }

    const conversationResult = await this.processAgentConversationUseCase.execute(
      enrichedInput,
      userId,
      workspaceSlug,
    );
    const replyText = normalizeReplyText(conversationResult.replyText);
    this.logger?.info('whatsapp.conversation.result', {
      externalId: context.externalIdentity.externalId,
      senderId: enrichedInput.senderId,
      chatId: enrichedInput.chatId,
      messageId: enrichedInput.messageId,
      messageText: enrichedInput.messageText,
      action: conversationResult.action,
      replyText,
    });
    const shouldReply = conversationResult.action !== 'cancel';
    const sendResult = shouldReply
      ? await this.sendReply(enrichedInput.chatId, replyText)
      : { ok: false as const, error: 'reply_not_needed' };
    this.logger?.info('whatsapp.reply.dispatch', {
      externalId: context.externalIdentity.externalId,
      chatId: enrichedInput.chatId,
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

  private async handleAskCommand(
    context: WhatsappWebhookContext,
    userId: string,
    workspaceSlug: string,
    input: ConversationInput,
    question: string,
  ) {
    if (!this.askKnowledgeUseCase) {
      return this.processed(context, { ok: true, resolvedUserId: userId, processed: false }, userId);
    }
    const result = await this.askKnowledgeUseCase.execute(question, userId, { workspaceSlug });
    const attachmentResolution = await this.resolveAskAttachments(userId, workspaceSlug, result);
    const replyText = formatAskReply(result, attachmentResolution);
    const sendResult = await this.sendReply(input.chatId, replyText);
    const mediaDispatch = await this.sendAskAttachments(input.chatId, attachmentResolution);
    this.logger?.info('whatsapp.ask.reply', {
      externalId: context.externalIdentity.externalId,
      chatId: input.chatId,
      messageId: input.messageId,
      confidence: result.confidence,
      sourceCount: result.sources.length,
      sendOk: sendResult.ok,
      sendError: sendResult.ok ? '' : sendResult.error,
      attachmentRequested: attachmentResolution.requested,
      attachmentCount: attachmentResolution.attachmentCount,
      attachmentSentCount: mediaDispatch.sentCount,
      attachmentOversizedCount: attachmentResolution.oversizedCount,
      attachmentFailedCount: mediaDispatch.failedCount,
    });
    return this.processed(context, {
      ok: true,
      processed: true,
      action: 'ask',
      message: replyText,
      payload: null,
      askResult: result,
      conversationResult: { action: 'ask', replyText, payload: null },
      replySent: sendResult.ok,
      replyError: sendResult.ok ? undefined : sendResult.error,
      mediaSent: mediaDispatch.sentCount,
      mediaFailed: mediaDispatch.failedCount,
      mediaOversized: attachmentResolution.oversizedCount,
      mediaMissingContent: attachmentResolution.missingContentCount,
    }, userId);
  }

  private async sendReply(chatJid: string, text: string) {
    if (!this.whatsappReplySender) return { ok: false as const, error: 'whatsapp_reply_sender_not_configured' };
    return this.whatsappReplySender.sendText({ chatJid, text });
  }

  private async resolveAskAttachments(
    userId: string,
    workspaceSlug: string,
    result: Awaited<ReturnType<AskKnowledgeUseCase['execute']>>,
  ): Promise<WhatsappAskAttachmentResolution> {
    if (!this.resolveWhatsappAskAttachmentsUseCase) {
      return { requested: false, noteCount: 0, attachmentCount: 0, media: [], oversizedCount: 0, missingContentCount: 0 };
    }
    return this.resolveWhatsappAskAttachmentsUseCase.execute({
      userId,
      workspaceSlug,
      requestedAttachments: result.requestedAttachments,
      requestedAttachmentPattern: result.requestedAttachmentPattern,
      sources: result.sources,
      relatedNotes: result.relatedNotes,
    });
  }

  private async sendAskAttachments(chatJid: string, attachmentResolution: WhatsappAskAttachmentResolution) {
    let sentCount = 0;
    let failedCount = 0;
    if (!attachmentResolution.requested || !this.whatsappReplySender) return { sentCount, failedCount };

    for (const media of attachmentResolution.media) {
      const result = await this.whatsappReplySender.sendMedia({
        chatJid,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
        fileName: media.fileName,
        mediaBase64: media.mediaBase64,
      });
      if (result.ok) {
        sentCount += 1;
      } else {
        failedCount += 1;
        this.logger?.warn('whatsapp.ask.media_send_failed', {
          chatJid,
          noteId: media.noteId,
          attachmentId: media.attachmentId,
          fileName: media.fileName,
          error: result.error || 'unknown_error',
        });
      }
    }

    return { sentCount, failedCount };
  }

  private async handleRateLimitedMessage(
    context: WhatsappWebhookContext,
    userId: string,
    chatId: string,
    rateLimit: { retryAfterSeconds: number; noticeAllowed: boolean },
  ) {
    const message = `I received too many messages in a short time. Wait ${rateLimit.retryAfterSeconds}s and send it again.`;
    const sendResult = rateLimit.noticeAllowed
      ? await this.sendReply(chatId, message)
      : { ok: false as const, error: 'rate_limit_notice_suppressed' };
    this.logger?.info('whatsapp.webhook.rate_limited', {
      externalId: context.externalIdentity.externalId,
      chatId,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      noticeSent: sendResult.ok,
      noticeError: sendResult.ok ? '' : sendResult.error,
    });
    return this.processed(context, {
      ok: true,
      processed: false,
      ignored: 'rate_limited',
      message,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      replySent: sendResult.ok,
      replyError: sendResult.ok ? undefined : sendResult.error,
    }, userId);
  }

  private async isWhatsappIntegrationActive(userId: string, workspaceSlug: string) {
    const credential = await this.credentials.findCredential(userId, workspaceSlug, IntegrationProvider.Whatsapp);
    return Boolean(credential && credential.status === CredentialRecordStatus.Connected && !credential.revokedAt);
  }

  private conversationQueueKey(userId: string, workspaceSlug: string, input: ConversationInput) {
    return `${userId}:${workspaceSlug}:${input.chatId}:${input.senderId}`;
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

  private async withDownloadedMedia(context: WhatsappWebhookContext, input: ConversationInput): Promise<ConversationInput> {
    if (!input.hasMedia || input.media.dataBase64) return input;
    if (!this.whatsappMediaDownloader) return input;
    const result = await this.whatsappMediaDownloader.downloadBase64({ body: context.body });
    if (!result.ok) {
      this.logger?.warn('whatsapp.media.download_failed', {
        externalId: context.externalIdentity.externalId,
        chatId: input.chatId,
        messageId: input.messageId,
        error: result.error,
      });
      return input;
    }
    return {
      ...input,
      media: {
        ...input.media,
        dataBase64: result.dataBase64,
      },
    };
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
  return String(value || '').trim() || 'I could not build the reply. Please try again.';
}

function formatAskReply(
  result: Awaited<ReturnType<AskKnowledgeUseCase['execute']>>,
  attachmentResolution?: WhatsappAskAttachmentResolution,
) {
  const lines = [
    String(result.answer || '').trim() || 'I could not build the answer. Please try again.',
    ...formatAskAttachmentNotices(attachmentResolution),
    '',
    `Confidence: ${result.confidence}`,
    ...result.sources.slice(0, 3).map((source) => `Source: ${source.title} (${source.path})`),
  ];
  return lines.filter(Boolean).join('\n');
}

function formatAskAttachmentNotices(attachmentResolution?: WhatsappAskAttachmentResolution) {
  if (!attachmentResolution?.requested) return [];
  const notices: string[] = [];
  if (attachmentResolution.noteCount > 0 && attachmentResolution.attachmentCount === 0) {
    notices.push('Não encontrei arquivo anexado nas notas encontradas.');
  }
  if (attachmentResolution.oversizedCount > 0) {
    notices.push(`Encontrei ${attachmentResolution.oversizedCount} arquivo(s) acima de 15 MB e não enviei por tamanho.`);
  }
  return notices;
}
