import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import type { SaveWorkspaceInput } from '../../application/models/repository-records.models.js';
import { workspaceFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { workspaces } from '../persistence/schema/index.js';

@Injectable()
export class PostgresWorkspaceRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(workspaces.workspaceSlug);
    
    return result.map(workspaceFromRow);
  }

  async upsert(userId: string, input: SaveWorkspaceInput) {
    const db = this.database.getDb();
    const result = await db
      .insert(workspaces)
      .values({
        id: crypto.randomUUID(),
        userId,
        workspaceSlug: input.workspaceSlug,
        displayName: input.displayName,
        whatsappChatJid: input.whatsappChatJid,
        telegramChatId: input.telegramChatId,
      })
      .onConflictDoUpdate({
        target: [workspaces.userId, workspaces.workspaceSlug],
        set: {
          displayName: input.displayName,
          whatsappChatJid: input.whatsappChatJid,
          telegramChatId: input.telegramChatId,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return workspaceFromRow(result[0]);
  }
}
