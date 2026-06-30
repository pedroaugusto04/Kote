import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhookRateLimitGuard } from '../../guards/auth.guards.js';
import { HandleStripeWebhookUseCase } from '../../../../application/use-cases/index.js';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@ApiTags('Billing Webhooks')
@Controller('api/webhooks/stripe')
@UseGuards(WebhookRateLimitGuard)
export class StripeWebhookController {
  constructor(
    private readonly handleStripeWebhookUseCase: HandleStripeWebhookUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Stripe payment gateway webhook event' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed/enqueued' })
  async handleWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RequestWithRawBody,
  ) {
    const rawBodyStr = req.rawBody ? req.rawBody.toString('utf8') : undefined;
    return this.handleStripeWebhookUseCase.execute(body, headers, rawBodyStr);
  }
}
