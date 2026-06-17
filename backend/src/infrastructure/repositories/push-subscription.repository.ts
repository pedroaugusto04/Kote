import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import { PushSubscriptionRepository } from '../../application/ports/push/push-subscription.repository.js';
import type { PushSubscriptionRecord } from '../../application/models/repository-records.models.js';
import { pushSubscriptionFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { pushSubscriptions } from '../persistence/schema/index.js';

@Injectable()
export class PostgresPushSubscriptionRepository extends PushSubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async save(input: Omit<PushSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PushSubscriptionRecord> {
    const db = this.database.getDb();
    const result = await db
      .insert(pushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: input.p256dh,
          auth: input.auth,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return pushSubscriptionFromRow(result[0]);
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .returning();
    
    return result.length > 0;
  }

  async listByUserId(userId: string): Promise<PushSubscriptionRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(pushSubscriptions.createdAt);
    
    return result.map(pushSubscriptionFromRow);
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    
    return result[0] ? pushSubscriptionFromRow(result[0]) : null;
  }
}
