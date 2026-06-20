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
    
    let projectId = input.projectId;
    if (!projectId && input.projectSlug) {
      const projResult = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.projectSlug, input.projectSlug)))
        .limit(1);
      if (projResult.length > 0) {
        projectId = projResult[0].id;
      }
    }
    if (!projectId) {
      throw new Error(`Project not found for slug: ${input.projectSlug}`);
    }

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

  async upsertWithClient(client: PoolClient, userId: string, input: SaveProjectFolderInput) {
    let projectId = input.projectId;
    if (!projectId && input.projectSlug) {
      const projResult = await client.query('select id from kb_projects where user_id = $1 and project_slug = $2 limit 1', [userId, input.projectSlug]);
      if (projResult.rows.length > 0) {
        projectId = projResult.rows[0].id;
      }
    }
    if (!projectId) {
      throw new Error(`Project not found for slug: ${input.projectSlug}`);
    }

    const result = await client.query(
      `insert into kb_project_folders (
         id, user_id, project_id, parent_folder_id, display_name, folder_slug, full_slug_path
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id)
       do update set
         project_id = excluded.project_id,
         parent_folder_id = excluded.parent_folder_id,
         display_name = excluded.display_name,
         folder_slug = excluded.folder_slug,
         full_slug_path = excluded.full_slug_path,
         updated_at = now()
       returning *`,
      [
        input.id || crypto.randomUUID(),
        userId,
        projectId,
        input.parentFolderId,
        input.displayName,
        input.folderSlug,
        input.fullSlugPath,
      ]
    );
    return {
      ...result.rows[0],
      project_slug: input.projectSlug,
      workspace_slug: input.workspaceSlug
    };
  }
}
