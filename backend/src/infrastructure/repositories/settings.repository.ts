import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresDatabase } from '../persistence/database.js';
import type { SettingsRepository, AutoActionGlobal } from '../../application/ports/settings.repository.js';
import { autoActionGlobal } from '../persistence/schema/index.js';

@Injectable()
export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async getAutoActionGlobal(userId: string): Promise<AutoActionGlobal | null> {
    const db = this.database.getDb();
    const rows = await db.select().from(autoActionGlobal).where(eq(autoActionGlobal.userId, userId)).limit(1);
    const row = rows[0] || null;
    if (!row) return null;

    return {
      enabled: Boolean(row.enabled),
      action: row.action as AutoActionGlobal['action'],
      afterHours: row.afterHours ?? null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  async setAutoActionGlobal(userId: string, input: { enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours?: number | null }): Promise<AutoActionGlobal> {
    const db = this.database.getDb();

    // Check if a row exists for this user
    const existing = await db.select().from(autoActionGlobal).where(eq(autoActionGlobal.userId, userId)).limit(1);

    let r;
    if (existing.length > 0) {
      // Update existing row
      const updated = await db
        .update(autoActionGlobal)
        .set({ enabled: input.enabled, action: input.action, afterHours: input.afterHours ?? null, updatedAt: new Date() })
        .where(eq(autoActionGlobal.userId, userId))
        .returning();
      r = updated[0];
    } else {
      // Insert new row for this user
      const inserted = await db
        .insert(autoActionGlobal)
        .values({ userId, enabled: input.enabled, action: input.action, afterHours: input.afterHours ?? null, updatedAt: new Date() })
        .returning();
      r = inserted[0];
    }

    return {
      enabled: Boolean(r.enabled),
      action: r.action as AutoActionGlobal['action'],
      afterHours: r.afterHours ?? null,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    };
  }
}
