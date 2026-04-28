import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { readEnvironment } from '../../../../adapters/environment.js';
import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { ExternalIdentityRepository, WebhookEventRepository } from '../../../ports/repositories.js';
import { extractWhatsappExternalId, normalizeHeaders } from '../../../utils/webhook.utils.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';
import type { IngestPayload } from '../../../../contracts/ingest.js';

export type WhatsappWebhookRequest = {
  headers?: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
};

@Injectable()
export class HandleWhatsappWebhookUseCase {
  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository = externalIdentities as unknown as WebhookEventRepository,
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
