import { Controller, Get, Post, Delete, Body, Param, UseGuards, Sse, MessageEvent, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, from, concat } from 'rxjs';
import { filter, map, switchMap } from 'rxjs';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard } from '../../auth.guards.js';
import { BillingCycle, BillingType } from '../../../../domain/enums/billing.enums.js';
import { COUNTRY_CODE } from '../../../../domain/constants/billing.constants.js';
import { BillingEventBus } from '../../../../application/services/billing-event.bus.js';
import {
  GetPlansUseCase,
  GetSubscriptionStatusUseCase,
  UpdateSubscriptionUseCase,
  CancelPaymentUseCase,
  CancelScheduledChangeUseCase,
} from '../../../../application/use-cases/index.js';

@ApiTags('Subscription')
@Controller('api/subscription')
@UseGuards(AccessTokenAuthGuard)
export class SubscriptionController {
  constructor(
    private readonly getPlansUseCase: GetPlansUseCase,
    private readonly getSubscriptionStatusUseCase: GetSubscriptionStatusUseCase,
    private readonly updateSubscriptionUseCase: UpdateSubscriptionUseCase,
    private readonly cancelPaymentUseCase: CancelPaymentUseCase,
    private readonly cancelScheduledChangeUseCase: CancelScheduledChangeUseCase,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  @Sse('status/stream')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream user subscription status updates' })
  streamStatus(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return concat(
      from(this.getSubscriptionStatusUseCase.execute(user.id)).pipe(
        map((status) => ({ data: status } as MessageEvent))
      ),
      this.billingEventBus.getEvents().pipe(
        filter((userId) => userId === user.id),
        switchMap(() => this.getSubscriptionStatusUseCase.execute(user.id)),
        map((status) => ({ data: status } as MessageEvent))
      )
    );
  }

  @Get('plans')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of available plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  async getPlans() {
    return this.getPlansUseCase.execute();
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current subscription status summary and quota status' })
  @ApiResponse({ status: 200, description: 'Subscription status summary retrieved successfully' })
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.getSubscriptionStatusUseCase.execute(user.id);
  }

  @Get('country')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detect user country based on headers' })
  @ApiResponse({ status: 200, description: 'User country code retrieved successfully' })
  async getCountry(
    @Headers('x-user-country') userCountryHeader?: string,
    @Headers('cf-ipcountry') cfCountryHeader?: string,
    @Headers('accept-language') acceptLanguageHeader?: string,
  ) {
    let countryCode: string = COUNTRY_CODE.UNITED_STATES;
    if (userCountryHeader && userCountryHeader.trim().length > 0) {
      countryCode = userCountryHeader.trim().toUpperCase();
    } else if (cfCountryHeader && cfCountryHeader.trim().length > 0) {
      countryCode = cfCountryHeader.trim().toUpperCase();
    } else if (acceptLanguageHeader && acceptLanguageHeader.toLowerCase().includes('pt-br')) {
      countryCode = COUNTRY_CODE.BRAZIL;
    }
    return { country: countryCode };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update or create user subscription' })
  @ApiResponse({ status: 200, description: 'Subscription updated successfully' })
  async updateSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      planId: string;
      billingCycle?: BillingCycle;
      billingType?: BillingType;
      cpfCnpj?: string;
      countryCode?: string;
      creditCardToken?: string;
    },
    @Headers('x-user-country') userCountryHeader?: string,
    @Headers('cf-ipcountry') cfCountryHeader?: string,
    @Headers('accept-language') acceptLanguageHeader?: string,
  ) {
    const { planId, billingCycle, billingType, cpfCnpj, creditCardToken } = body;

    let countryCode: string = body.countryCode || '';
    if (!countryCode) {
      if (userCountryHeader && userCountryHeader.trim().length > 0) {
        countryCode = userCountryHeader.trim();
      } else if (cfCountryHeader && cfCountryHeader.trim().length > 0) {
        countryCode = cfCountryHeader.trim();
      } else if (acceptLanguageHeader && acceptLanguageHeader.toLowerCase().includes('pt-br')) {
        countryCode = COUNTRY_CODE.BRAZIL;
      } else {
        countryCode = COUNTRY_CODE.UNITED_STATES;
      }
    }

    return this.updateSubscriptionUseCase.execute({
      userId: user.id,
      email: user.email,
      displayName: user.displayName || null,
      planId,
      billingCycle,
      billingType,
      cpfCnpj,
      countryCode,
      creditCardToken,
    });
  }

  @Delete('payment/:paymentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel pending payment' })
  @ApiResponse({ status: 200, description: 'Payment canceled successfully' })
  async cancelPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.cancelPaymentUseCase.execute(user.id, paymentId);
  }

  @Delete('scheduled-change/:changeId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel scheduled change' })
  @ApiResponse({ status: 200, description: 'Scheduled change canceled successfully' })
  async cancelScheduledChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param('changeId') changeId: string,
  ) {
    return this.cancelScheduledChangeUseCase.execute(user.id, changeId);
  }
}
