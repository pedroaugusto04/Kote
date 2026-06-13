import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import {
  CreateWebhookSubscriptionUseCase,
  DeleteWebhookSubscriptionUseCase,
  ListWebhookSubscriptionsUseCase,
  UpdateWebhookSubscriptionUseCase,
} from '../../../../application/use-cases/webhook-subscriptions/webhook-subscription.use-cases.js';
import { WEBHOOK_TRIGGER_REGISTRY } from '../../../../domain/webhook-trigger-registry.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import {
  createWebhookSubscriptionBodySchema,
  updateWebhookSubscriptionBodySchema,
  webhookSubscriptionIdParamSchema,
  webhookSubscriptionQuerySchema,
  type CreateWebhookSubscriptionBody,
  type UpdateWebhookSubscriptionBody,
  type WebhookSubscriptionIdParam,
  type WebhookSubscriptionQuery,
} from '../../dto/webhook-subscription.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Webhook Subscriptions')
@Controller('api/webhook-subscriptions')
@UseGuards(AccessTokenAuthGuard)
export class WebhookSubscriptionsController {
  constructor(
    private readonly listSubscriptions: ListWebhookSubscriptionsUseCase,
    private readonly createSubscription: CreateWebhookSubscriptionUseCase,
    private readonly updateSubscription: UpdateWebhookSubscriptionUseCase,
    private readonly deleteSubscription: DeleteWebhookSubscriptionUseCase,
  ) {}

  @Get('triggers')
  @ApiOperation({ summary: 'List available webhook triggers' })
  @ApiResponse({ status: 200, description: 'Triggers retrieved successfully' })
  triggers() {
    return { ok: true, triggers: WEBHOOK_TRIGGER_REGISTRY };
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List webhook subscriptions' })
  @ApiResponse({ status: 200, description: 'Subscriptions retrieved successfully' })
  list(
    @Query(new ZodValidationPipe(webhookSubscriptionQuerySchema, 'invalid_webhook_subscription_query')) query: WebhookSubscriptionQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listSubscriptions.execute(user.id, query.workspaceSlug);
  }

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create webhook subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  create(
    @Body(new ZodValidationPipe(createWebhookSubscriptionBodySchema, 'invalid_create_webhook_subscription_payload')) body: CreateWebhookSubscriptionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createSubscription.execute(user.id, body);
  }

  @Patch(':id')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update webhook subscription' })
  @ApiParam({ name: 'id', description: 'Subscription ID' })
  @ApiResponse({ status: 200, description: 'Subscription updated successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  update(
    @Param(new ZodValidationPipe(webhookSubscriptionIdParamSchema, 'invalid_webhook_subscription_id')) params: WebhookSubscriptionIdParam,
    @Body(new ZodValidationPipe(updateWebhookSubscriptionBodySchema, 'invalid_update_webhook_subscription_payload')) body: UpdateWebhookSubscriptionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateSubscription.execute(user.id, params.id, body);
  }

  @Delete(':id')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete webhook subscription' })
  @ApiParam({ name: 'id', description: 'Subscription ID' })
  @ApiResponse({ status: 200, description: 'Subscription deleted successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  remove(
    @Param(new ZodValidationPipe(webhookSubscriptionIdParamSchema, 'invalid_webhook_subscription_id')) params: WebhookSubscriptionIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteSubscription.execute(user.id, params.id);
  }
}
