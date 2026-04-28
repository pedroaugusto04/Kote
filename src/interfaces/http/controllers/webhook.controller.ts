import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { HandleGithubPushUseCase, HandleWhatsappWebhookUseCase } from '../../../application/use-cases/index.js';
import { WebhookRateLimitGuard } from '../auth.guards.js';
import { githubPushWebhookBodySchema, whatsappWebhookBodySchema, type GithubPushWebhookBody, type WhatsappWebhookBody } from '../dto/webhook.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/webhooks')
@UseGuards(WebhookRateLimitGuard)
export class WebhookController {
  constructor(
    private readonly githubPush: HandleGithubPushUseCase,
    private readonly whatsappWebhook: HandleWhatsappWebhookUseCase,
  ) {}

  @Post('github/push')
  github(@Body(new ZodValidationPipe(githubPushWebhookBodySchema, 'invalid_github_webhook_payload')) body: GithubPushWebhookBody, @Req() request: Request & { rawBody?: Buffer }) {
    return this.githubPush.execute({
      headers: request.headers,
      body,
      rawBody: request.rawBody?.toString('utf8') || JSON.stringify(body || {}),
    });
  }

  @Post('whatsapp')
  whatsapp(@Body(new ZodValidationPipe(whatsappWebhookBodySchema, 'invalid_whatsapp_webhook_payload')) body: WhatsappWebhookBody, @Req() request: Request) {
    return this.whatsappWebhook.execute({ headers: request.headers, body });
  }
}
