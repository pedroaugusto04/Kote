import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { extractTelegramChatId, extractTelegramConnectionCode, IntegrationConnectionService } from '../../../integration-connections.js';
import type { TelegramWebhookRequest } from '../../../models/webhook-request.models.js';
import { ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';

@Injectable()
export class HandleTelegramWebhookUseCase {
  constructor(
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly connections?: IntegrationConnectionService,
  ) {}

  async execute(input: TelegramWebhookRequest) {
    const environment = this.environmentProvider.read();
    const headers = normalizeHeaders(input.headers || {});
    const body = input.body || {};
    const token = String(headers['x-telegram-bot-api-secret-token'] || headers['x-kb-webhook-token'] || '');
    const externalId = extractTelegramChatId(body);
    const externalIdentity = { provider: ExternalIdentityProvider.Telegram, identityType: 'chat_id', externalId };
    if (!environment.telegramWebhookToken || token !== environment.telegramWebhookToken) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Telegram,
        eventType: 'message',
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'invalid_webhook_token',
      });
      throw new UnauthorizedException('invalid_webhook_token');
    }
    if (!externalId) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Telegram,
        eventType: 'message',
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'missing_external_identity',
      });
      throw new UnauthorizedException('missing_external_identity');
    }
    const connectionCode = extractTelegramConnectionCode(body);
    if (connectionCode && this.connections) {
      const result = await this.connections.completeTelegramFromWebhook({ code: connectionCode, chatId: externalId });
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Telegram,
        eventType: 'connection',
        status: WebhookEventStatus.Processed,
        resolvedUserId: result.resolvedUserId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return { ok: true, connected: true, resolvedUserId: result.resolvedUserId, workspaceSlug: result.workspaceSlug };
    }
    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.Telegram, 'chat_id', externalId);
    if (!identity) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.Telegram,
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
      provider: IntegrationProvider.Telegram,
      eventType: 'message',
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
      externalIdentity,
      rawHeaders: headers,
      rawPayload: body,
    });
    return { ok: true, resolvedUserId: identity.userId, processed: false };
  }
}
