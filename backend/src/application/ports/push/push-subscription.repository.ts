import type { PushSubscriptionRecord } from '../../models/repository-records.models.js';

export abstract class PushSubscriptionRepository {
  abstract save(
    input: Omit<PushSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PushSubscriptionRecord>;
  
  abstract deleteByEndpoint(userId: string, endpoint: string): Promise<boolean>;
  
  abstract listByUserId(userId: string): Promise<PushSubscriptionRecord[]>;
  
  abstract findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null>;
}
