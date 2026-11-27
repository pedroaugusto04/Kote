import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing/subscription.service.js';

@Injectable()
export class GetPlansUseCase {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async execute() {
    return this.subscriptionService.getPlans();
  }
}
