import { Injectable } from '@nestjs/common';
import { type Observable, concat, from, filter, map, switchMap } from 'rxjs';
import { BillingEventBus } from '../../event-buses/billing-event.bus.js';
import { GetSubscriptionStatusUseCase } from '../../use-cases/billing/get-subscription-status.use-case.js';

export type SubscriptionStatusStreamEvent = {
  data: Awaited<ReturnType<GetSubscriptionStatusUseCase['execute']>>;
};

@Injectable()
export class BillingEventStreamService {
  constructor(
    private readonly billingEventBus: BillingEventBus,
    private readonly getSubscriptionStatusUseCase: GetSubscriptionStatusUseCase,
  ) {}

  streamUserStatus(userId: string): Observable<SubscriptionStatusStreamEvent> {
    return concat(
      from(this.getSubscriptionStatusUseCase.execute(userId)).pipe(
        map((status) => ({ data: status })),
      ),
      this.billingEventBus.getEvents().pipe(
        filter((eventUserId) => eventUserId === userId),
        switchMap(() => this.getSubscriptionStatusUseCase.execute(userId)),
        map((status) => ({ data: status })),
      ),
    );
  }
}
