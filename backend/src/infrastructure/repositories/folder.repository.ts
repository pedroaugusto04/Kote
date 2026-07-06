import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { eq, and } from 'drizzle-orm';

import type { SaveProjectFolderInput } from '../../application/models/repository-records.models.js';
import { projectFolderFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projectFolders, projects, workspaces } from '../persistence/schema/index.js';

@Injectable()
export class PostgresFolderRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string, projectId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: projectFolders.id,
        projectId: projectFolders.projectId,
        parentFolderId: projectFolders.parentFolderId,
        displayName: projectFolders.displayName,
        folderSlug: projectFolders.folderSlug,
        fullSlugPath: projectFolders.fullSlugPath,
        createdAt: projectFolders.createdAt,
        updatedAt: projectFolders.updatedAt,
        projectSlug: projects.projectSlug,
        workspaceSlug: workspaces.workspaceSlug,
      })
      .from(projectFolders)
      .innerJoin(projects, and(eq(projects.id, projectFolders.projectId), eq(projects.userId, userId)))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(projectFolders.userId, userId), eq(projectFolders.projectId, projectId)))
      .orderBy(projectFolders.fullSlugPath);
    
    return result.map(projectFolderFromRow);
  }

  async getById(userId: string, projectId: string, folderId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: projectFolders.id,
        projectId: projectFolders.projectId,
        parentFolderId: projectFolders.parentFolderId,
        displayName: projectFolders.displayName,
        folderSlug: projectFolders.folderSlug,
        fullSlugPath: projectFolders.fullSlugPath,
        createdAt: projectFolders.createdAt,
        updatedAt: projectFolders.updatedAt,
        projectSlug: projects.projectSlug,
        workspaceSlug: workspaces.workspaceSlug,
      })
      .from(projectFolders)
      .innerJoin(projects, and(eq(projects.id, projectFolders.projectId), eq(projects.userId, userId)))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(
        eq(projectFolders.userId, userId),
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.id, folderId)
      ))
      .limit(1);
    
    return result[0] ? projectFolderFromRow(result[0]) : null;
  }

  async upsert(userId: string, input: SaveProjectFolderInput) {
    const db = this.database.getDb();
    
    const projectId = input.projectId;
    const result = await db
      .insert(projectFolders)
      .values({
        id: input.id || crypto.randomUUID(),
        userId,
        projectId,
        parentFolderId: input.parentFolderId,
        displayName: input.displayName,
        folderSlug: input.folderSlug,
        fullSlugPath: input.fullSlugPath,
      })
      .onConflictDoUpdate({
        target: projectFolders.id,
        set: {
          projectId,
          parentFolderId: input.parentFolderId,
          displayName: input.displayName,
          folderSlug: input.folderSlug,
          fullSlugPath: input.fullSlugPath,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return projectFolderFromRow({
      ...result[0],
      projectSlug: input.projectSlug,
      workspaceSlug: input.workspaceSlug
    });
  }

  async delete(userId: string, projectId: string, folderId: string) {
    const db = this.database.getDb();
    const result = await db
      .delete(projectFolders)
      .where(and(
        eq(projectFolders.userId, userId),
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.id, folderId)
      ))
      .returning();
    
    return result.length > 0;
  }

  async upsertWithClient(dbOrTx: any, userId: string, input: SaveProjectFolderInput) {
    const projectId = input.projectId;
    const result = await dbOrTx
      .insert(projectFolders)
      .values({
        id: input.id || crypto.randomUUID(),
        userId,
        projectId,
        parentFolderId: input.parentFolderId,
        displayName: input.displayName,
        folderSlug: input.folderSlug,
        fullSlugPath: input.fullSlugPath,
      })
      .onConflictDoUpdate({
        target: projectFolders.id,
        set: {
          projectId,
          parentFolderId: input.parentFolderId,
          displayName: input.displayName,
          folderSlug: input.folderSlug,
          fullSlugPath: input.fullSlugPath,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }
}
