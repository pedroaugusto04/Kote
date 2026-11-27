import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';

import { HandleTelegramWebhookUseCase, HandleWhatsappWebhookUseCase } from '../../../../application/use-cases/index.js';
import { RouteGithubWebhookUseCase } from '../../../../application/use-cases/webhooks/github/route-github-webhook.use-case.js';
import { WebhookRateLimitGuard } from '../../guards/auth.guards.js';
import { githubPushWebhookBodySchema, telegramWebhookBodySchema, whatsappWebhookBodySchema, type GithubPushWebhookBody, type TelegramWebhookBody, type WhatsappWebhookBody } from '../../dto/webhook.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Webhooks')
@Controller('api/webhooks')
@UseGuards(WebhookRateLimitGuard)
export class WebhookController {
  constructor(
    private readonly routeGithubWebhook: RouteGithubWebhookUseCase,
    private readonly whatsappWebhook: HandleWhatsappWebhookUseCase,
    private readonly telegramWebhook: HandleTelegramWebhookUseCase,
  ) {}

  @Post('github/push')
  @ApiOperation({ summary: 'Handle GitHub webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  github(@Body(new ZodValidationPipe(githubPushWebhookBodySchema, 'invalid_github_webhook_payload')) body: GithubPushWebhookBody, @Req() request: Request & { rawBody?: Buffer }) {
    return this.routeGithubWebhook.execute({
      headers: request.headers,
      body,
      rawBodyBuffer: request.rawBody,
    });
  }

  @Post('whatsapp')
  @ApiOperation({ summary: 'Handle WhatsApp webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  whatsapp(@Body(new ZodValidationPipe(whatsappWebhookBodySchema, 'invalid_whatsapp_webhook_payload')) body: WhatsappWebhookBody, @Req() request: Request) {
    return this.whatsappWebhook.execute({ headers: request.headers, body });
  }

  @Post('telegram')
  @ApiOperation({ summary: 'Handle Telegram webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  telegram(@Body(new ZodValidationPipe(telegramWebhookBodySchema, 'invalid_telegram_webhook_payload')) body: TelegramWebhookBody, @Req() request: Request) {
    return this.telegramWebhook.execute({ headers: request.headers, body });
  }
}
