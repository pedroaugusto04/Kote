import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import type { CategoryRecord } from '../../application/models/repository-records.models.js';
import { categoryFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { categories, workspaces } from '../persistence/schema/index.js';

@Injectable()
export class PostgresCategoryRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string, workspaceId: string): Promise<CategoryRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        workspaceId: categories.workspaceId,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
        isSystem: categories.isSystem,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.workspaceId, workspaceId)))
      .orderBy(categories.name);

    return result.map(categoryFromRow);
  }

  async getById(userId: string, categoryId: string): Promise<CategoryRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        workspaceId: categories.workspaceId,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
        isSystem: categories.isSystem,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
      .limit(1);

    return result[0] ? categoryFromRow(result[0]) : null;
  }

  async create(
    userId: string,
    workspaceId: string,
    input: { name: string; color?: string; icon?: string; isSystem?: boolean }
  ): Promise<CategoryRecord> {
    const db = this.database.getDb();

    const result = await db
      .insert(categories)
      .values({
        id: crypto.randomUUID(),
        userId,
        workspaceId,
        name: input.name,
        color: input.color || '#9e9e9e',
        icon: input.icon || '',
        isSystem: input.isSystem || false,
      })
      .returning();

    return categoryFromRow(result[0]);
  }

  async findByName(userId: string, workspaceId: string, name: string): Promise<CategoryRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        workspaceId: categories.workspaceId,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
        isSystem: categories.isSystem,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .where(and(
        eq(categories.userId, userId),
        eq(categories.workspaceId, workspaceId),
        eq(categories.name, name)
      ))
      .limit(1);

    return result[0] ? categoryFromRow(result[0]) : null;
  }
}
