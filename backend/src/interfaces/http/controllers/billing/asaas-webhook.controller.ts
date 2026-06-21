import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhookRateLimitGuard } from '../../auth.guards.js';
import { HandleAsaasWebhookUseCase } from '../../../../application/use-cases/index.js';

@ApiTags('Billing Webhooks')
@Controller('api/webhooks/asaas')
@UseGuards(WebhookRateLimitGuard)
export class AsaasWebhookController {
  constructor(
    private readonly handleAsaasWebhookUseCase: HandleAsaasWebhookUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Asaas payment gateway webhook event' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed/enqueued' })
  async handleWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.handleAsaasWebhookUseCase.execute(body, headers);
  }
}
