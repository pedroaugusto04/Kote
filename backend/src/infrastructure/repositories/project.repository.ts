import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { ListProjectsInput } from '../../application/models/project-list.models.js';
import type { RepositoryRecord, SaveProjectInput } from '../../application/models/repository-records.models.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { projectFromRow, repositoryFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { PROJECT_WITH_METADATA_SELECT_SQL } from './content/project-workspace.queries.js';

@Injectable()
export class PostgresProjectRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string) {
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT_SQL}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.is_favorite DESC, p.project_slug`,
      [userId]
    );
    return result.rows.map(projectFromRow);
  }

  async listPage(userId: string, input: ListProjectsInput) {
    const totalResult = await this.database.getPool().query(
      'select count(*)::int as total from kb_projects where user_id = $1 and enabled = true',
      [userId]
    );
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedSlug ? await this.resolveProjectPage(userId, input.selectedSlug, input.pageSize) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT_SQL}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.is_favorite DESC, p.project_slug
       LIMIT $2 OFFSET $3`,
      [userId, pagination.pageSize, offset]
    );

    return { items: result.rows.map(projectFromRow), pagination };
  }

  async getBySlug(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT_SQL}
       WHERE p.user_id = $1 AND p.project_slug = $2
       LIMIT 1`,
      [userId, projectSlug]
    );
    return result.rows[0] ? projectFromRow(result.rows[0]) : null;
  }

  async upsert(userId: string, input: SaveProjectInput) {
    const client = await this.database.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `insert into kb_projects (id, user_id, project_slug, display_name, workspace_slug, enabled, is_favorite)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, project_slug)
         do update set
           display_name = excluded.display_name,
           workspace_slug = excluded.workspace_slug,
           enabled = excluded.enabled,
           is_favorite = excluded.is_favorite,
           updated_at = now()
         returning *`,
        [
          crypto.randomUUID(),
          userId,
          input.projectSlug,
          input.displayName,
          input.workspaceSlug,
          input.enabled,
          input.favorite ?? false,
        ]
      );
      const project = result.rows[0];
      const { defaultTags, repositories } = input;

      await client.query('DELETE FROM kb_project_default_tags WHERE project_id = $1', [project.id]);
      if (defaultTags.length > 0) {
        for (const tag of defaultTags) {
          await client.query('INSERT INTO kb_project_default_tags (project_id, tag) VALUES ($1, $2)', [project.id, tag]);
        }
      }

      await client.query('DELETE FROM kb_project_repositories WHERE project_id = $1', [project.id]);
      if (repositories.length > 0) {
        for (const repo of repositories) {
          await client.query('INSERT INTO kb_project_repositories (project_id, repository_id) VALUES ($1, $2)', [
            project.id,
            repo.id,
          ]);
        }
      }

      await client.query('COMMIT');
      return projectFromRow({ 
        ...project, 
        default_tags: defaultTags, 
        repositories
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async setFavorite(userId: string, projectSlug: string, favorite: boolean) {
    const result = await this.database.getPool().query(
      `UPDATE kb_projects SET is_favorite = $3, updated_at = now() WHERE user_id = $1 AND project_slug = $2 RETURNING *`,
      [userId, projectSlug, favorite]
    );
    return result.rows[0] ? projectFromRow(result.rows[0]) : null;
  }

  async delete(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query('delete from kb_projects where user_id = $1 and project_slug = $2', [userId, projectSlug]);
    return (result.rowCount || 0) > 0;
  }

  async listRepositories(userId: string, workspaceSlug: string) {
    const result = await this.database.getPool().query(
      `SELECT r.* FROM kb_repositories r
       JOIN kb_workspaces w ON w.workspace_slug = r.workspace_slug
       WHERE w.user_id = $1 AND r.workspace_slug = $2
       ORDER BY r.full_name`,
      [userId, workspaceSlug]
    );
    return result.rows.map(repositoryFromRow);
  }

  async upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const result = await this.database.getPool().query(
      `INSERT INTO kb_repositories (id, workspace_slug, external_id, full_name, html_url, description, default_branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (workspace_slug, external_id)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         html_url = EXCLUDED.html_url,
         description = EXCLUDED.description,
         default_branch = EXCLUDED.default_branch,
         updated_at = now()
       RETURNING *`,
      [
        input.id || crypto.randomUUID(),
        input.workspaceSlug,
        input.externalId,
        input.fullName,
        input.htmlUrl,
        input.description,
        input.defaultBranch,
      ]
    );
    return repositoryFromRow(result.rows[0]);
  }

  private async resolveProjectPage(userId: string, selectedSlug: string, pageSize: number) {
    const result = await this.database.getPool().query(
      `select count(*)::int as idx
       from kb_projects
       where user_id = $1
         and enabled = true
         and (
           is_favorite > (select is_favorite from kb_projects where user_id = $1 and project_slug = $2)
           or (is_favorite = (select is_favorite from kb_projects where user_id = $1 and project_slug = $2) and project_slug <= $2)
         )`,
      [userId, selectedSlug]
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / pageSize) : 1;
  }
}
