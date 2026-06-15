import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { SaveProjectFolderInput } from '../../application/models/repository-records.models.js';
import { projectFolderFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { UPSERT_PROJECT_FOLDER_SQL } from './content/folder.queries.js';

@Injectable()
export class PostgresFolderRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `select * from kb_project_folders
       where user_id = $1 and project_slug = $2
       order by full_slug_path`,
      [userId, projectSlug]
    );
    return result.rows.map(projectFolderFromRow);
  }

  async getById(userId: string, projectSlug: string, folderId: string) {
    const result = await this.database.getPool().query(
      `select * from kb_project_folders
       where user_id = $1 and project_slug = $2 and id = $3
       limit 1`,
      [userId, projectSlug, folderId]
    );
    return result.rows[0] ? projectFolderFromRow(result.rows[0]) : null;
  }

  async upsert(userId: string, input: SaveProjectFolderInput) {
    const result = await this.database.getPool().query(
      UPSERT_PROJECT_FOLDER_SQL,
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
    return projectFolderFromRow(result.rows[0]);
  }

  async delete(userId: string, projectSlug: string, folderId: string) {
    const result = await this.database.getPool().query(
      'delete from kb_project_folders where user_id = $1 and project_slug = $2 and id = $3',
      [userId, projectSlug, folderId]
    );
    return (result.rowCount || 0) > 0;
  }

  async upsertWithClient(client: PoolClient, userId: string, input: SaveProjectFolderInput) {
    return client.query(
      UPSERT_PROJECT_FOLDER_SQL,
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
  }
}
