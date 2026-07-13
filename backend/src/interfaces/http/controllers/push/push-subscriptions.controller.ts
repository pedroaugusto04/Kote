import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../application/auth.js';
import {
  CreatePushSubscriptionUseCase,
  DeletePushSubscriptionUseCase,
  ListPushSubscriptionsUseCase,
} from '../../../../application/use-cases/push/push-subscription.use-cases.js';
import { VapidService } from '../../../../application/services/notifications/vapid.service.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  createPushSubscriptionBodySchema,
  deletePushSubscriptionBodySchema,
  type CreatePushSubscriptionBody,
  type DeletePushSubscriptionBody,
} from '../../dto/push-subscription.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Push Subscriptions')
@Controller('api/push-subscriptions')
@UseGuards(AccessTokenAuthGuard)
export class PushSubscriptionsController {
  constructor(
    private readonly listSubscriptions: ListPushSubscriptionsUseCase,
    private readonly createSubscription: CreatePushSubscriptionUseCase,
    private readonly deleteSubscription: DeletePushSubscriptionUseCase,
    private readonly vapidService: VapidService,
  ) {}

  @Get('public-key')
  @ApiOperation({ summary: 'Get VAPID public key' })
  @ApiResponse({ status: 200, description: 'Public key retrieved successfully' })
  getPublicKey() {
    return { publicKey: this.vapidService.getPublicKey() };
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List push subscriptions' })
  @ApiResponse({ status: 200, description: 'Subscriptions retrieved successfully' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.listSubscriptions.execute(user.id);
  }

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create push subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  create(
    @Body(new ZodValidationPipe(createPushSubscriptionBodySchema, 'invalid_create_push_subscription_payload')) body: CreatePushSubscriptionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createSubscription.execute(user.id, body);
  }

  @Delete()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete push subscription' })
  @ApiResponse({ status: 200, description: 'Subscription deleted successfully' })
  remove(
    @Body(new ZodValidationPipe(deletePushSubscriptionBodySchema, 'invalid_delete_push_subscription_payload')) body: DeletePushSubscriptionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteSubscription.execute(user.id, body.endpoint);
  }
}
