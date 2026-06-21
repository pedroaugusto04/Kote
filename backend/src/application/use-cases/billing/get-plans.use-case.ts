import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing/SubscriptionService.js';

@Injectable()
export class GetPlansUseCase {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async execute() {
    return this.subscriptionService.getPlans();
  }
}
