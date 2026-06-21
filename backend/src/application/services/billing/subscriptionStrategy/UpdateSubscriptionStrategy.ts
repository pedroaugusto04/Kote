import { SubscriptionContext } from './subscriptionContext.js';
import { SubscriptionChangeKind } from './subscriptionChangeKind.js';

export interface UpdateSubscriptionStrategyResult {
  summary: unknown;
  changeKind: SubscriptionChangeKind;
}

export interface UpdateSubscriptionStrategy {
  execute(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult>;
}
