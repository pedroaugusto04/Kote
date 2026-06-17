import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { eq, and } from 'drizzle-orm';

import type { SaveProjectFolderInput } from '../../application/models/repository-records.models.js';
import { projectFolderFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projectFolders } from '../persistence/schema/index.js';

@Injectable()
export class PostgresFolderRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string, projectSlug: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(projectFolders)
      .where(and(eq(projectFolders.userId, userId), eq(projectFolders.projectSlug, projectSlug)))
      .orderBy(projectFolders.fullSlugPath);
    
    return result.map(projectFolderFromRow);
  }

  async getById(userId: string, projectSlug: string, folderId: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(projectFolders)
      .where(and(
        eq(projectFolders.userId, userId),
        eq(projectFolders.projectSlug, projectSlug),
        eq(projectFolders.id, folderId)
      ))
      .limit(1);
    
    return result[0] ? projectFolderFromRow(result[0]) : null;
  }

  async upsert(userId: string, input: SaveProjectFolderInput) {
    const db = this.database.getDb();
    const result = await db
      .insert(projectFolders)
      .values({
        id: input.id || crypto.randomUUID(),
        userId,
        workspaceSlug: input.workspaceSlug,
        projectSlug: input.projectSlug,
        parentFolderId: input.parentFolderId,
        displayName: input.displayName,
        folderSlug: input.folderSlug,
        fullSlugPath: input.fullSlugPath,
      })
      .onConflictDoUpdate({
        target: projectFolders.id,
        set: {
          workspaceSlug: input.workspaceSlug,
          projectSlug: input.projectSlug,
          parentFolderId: input.parentFolderId,
          displayName: input.displayName,
          folderSlug: input.folderSlug,
          fullSlugPath: input.fullSlugPath,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return projectFolderFromRow(result[0]);
  }

  async delete(userId: string, projectSlug: string, folderId: string) {
    const db = this.database.getDb();
    const result = await db
      .delete(projectFolders)
      .where(and(
        eq(projectFolders.userId, userId),
        eq(projectFolders.projectSlug, projectSlug),
        eq(projectFolders.id, folderId)
      ))
      .returning();
    
    return result.length > 0;
  }

  async upsertWithClient(client: PoolClient, userId: string, input: SaveProjectFolderInput) {
    const result = await client.query(
      `insert into kb_project_folders (
         id, user_id, workspace_slug, project_slug, parent_folder_id, display_name, folder_slug, full_slug_path
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id)
       do update set
         workspace_slug = excluded.workspace_slug,
         project_slug = excluded.project_slug,
         parent_folder_id = excluded.parent_folder_id,
         display_name = excluded.display_name,
         folder_slug = excluded.folder_slug,
         full_slug_path = excluded.full_slug_path,
         updated_at = now()
       returning *`,
      [
        input.id || crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.projectSlug,
        input.parentFolderId,
        input.displayName,
        input.folderSlug,
        input.fullSlugPath,
      ]
    );
    return result.rows[0];
  }
}
