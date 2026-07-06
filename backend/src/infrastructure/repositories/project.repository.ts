import crypto from 'node:crypto';

import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and, desc, sql, gt, lte, or, count } from 'drizzle-orm';

import type { ListProjectsInput } from '../../application/models/project-list.models.js';
import type { RepositoryRecord, SaveProjectInput } from '../../application/models/repository-records.models.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { projectFromRow, repositoryFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projects, repositories, workspaces, projectDefaultTags, projectRepositories } from '../persistence/schema/index.js';

const PROJECT_METADATA_SELECT = {
  id: projects.id,
  userId: projects.userId,
  projectSlug: projects.projectSlug,
  displayName: projects.displayName,
  workspaceId: projects.workspaceId,
  enabled: projects.enabled,
  isFavorite: projects.isFavorite,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  workspaceSlug: workspaces.workspaceSlug,
  defaultTags: sql<string[]>`COALESCE((SELECT jsonb_agg(tag) FROM kb_project_default_tags WHERE project_id = ${projects.id}), '[]'::jsonb)`,
  repositories: sql<any[]>`COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', r.id,
    'workspace_id', r.workspace_id,
    'workspace_slug', w2.workspace_slug,
    'external_id', r.external_id,
    'full_name', r.full_name,
    'html_url', r.html_url,
    'description', r.description,
    'default_branch', r.default_branch,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )) FROM kb_project_repositories pr JOIN kb_repositories r ON r.id = pr.repository_id JOIN kb_workspaces w2 ON w2.id = r.workspace_id WHERE pr.project_id = ${projects.id}), '[]'::jsonb)`
};

@Injectable()
export class PostgresProjectRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string) {
    const db = this.database.getDb();
    const result = await db
      .select(PROJECT_METADATA_SELECT)
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(projects.userId, userId), eq(projects.enabled, true)))
      .orderBy(desc(projects.isFavorite), projects.displayName);

    return result.map(projectFromRow);
  }

  async listPage(userId: string, input: ListProjectsInput) {
    const db = this.database.getDb();
    const totalResult = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.enabled, true)));
    const total = Number(totalResult[0]?.count || 0);

    const selectedPage = input.selectedSlug ? await this.resolveProjectPage(userId, input.selectedSlug, input.pageSize) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const result = await db
      .select(PROJECT_METADATA_SELECT)
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(projects.userId, userId), eq(projects.enabled, true)))
      .orderBy(desc(projects.isFavorite), projects.displayName)
      .limit(pagination.pageSize)
      .offset(offset);

    return { items: result.map(projectFromRow), pagination };
  }

  async getBySlug(userId: string, projectSlug: string) {
    const db = this.database.getDb();
    const result = await db
      .select(PROJECT_METADATA_SELECT)
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(projects.userId, userId), eq(projects.projectSlug, projectSlug)))
      .limit(1);

    return result[0] ? projectFromRow(result[0]) : null;
  }

  async getById(userId: string, id: string) {
    const db = this.database.getDb();
    const result = await db
      .select(PROJECT_METADATA_SELECT)
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .limit(1);

    return result[0] ? projectFromRow(result[0]) : null;
  }

  async upsert(userId: string, input: SaveProjectInput) {
    const db = this.database.getDb();
    return db.transaction(async (tx) => {
      let workspaceId = input.workspaceId;
      if (!workspaceId && input.workspaceSlug) {
        const workspaceResult = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(and(eq(workspaces.userId, userId), eq(workspaces.workspaceSlug, input.workspaceSlug)))
          .limit(1);
        workspaceId = workspaceResult[0]?.id;
      }

      const projectResult = await tx
        .insert(projects)
        .values({
          id: input.id || crypto.randomUUID(),
          userId,
          projectSlug: input.projectSlug,
          displayName: input.displayName,
          workspaceId: workspaceId!,
          enabled: input.enabled,
          isFavorite: input.favorite ?? false,
        })
        .onConflictDoUpdate({
          target: [projects.userId, projects.projectSlug],
          set: {
            displayName: input.displayName,
            workspaceId: workspaceId!,
            enabled: input.enabled,
            isFavorite: input.favorite ?? false,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      const project = projectResult[0];
      const { defaultTags = [], repositories = [] } = input;

      await tx
        .delete(projectDefaultTags)
        .where(eq(projectDefaultTags.projectId, project.id));
      
      if (defaultTags.length > 0) {
        await tx
          .insert(projectDefaultTags)
          .values(defaultTags.map((tag) => ({ projectId: project.id, tag })));
      }

      await tx
        .delete(projectRepositories)
        .where(eq(projectRepositories.projectId, project.id));

      if (repositories.length > 0) {
        await tx
          .insert(projectRepositories)
          .values(repositories.map((repo) => ({ projectId: project.id, repositoryId: repo.id })));
      }

      return projectFromRow({
        ...project,
        defaultTags,
        default_tags: defaultTags,
        repositories,
      });
    });
  }

  async setFavorite(userId: string, id: string, favorite: boolean) {
    const db = this.database.getDb();
    const result = await db
      .update(projects)
      .set({ isFavorite: favorite, updatedAt: new Date() })
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .returning();
    
    return result[0] ? projectFromRow(result[0]) : null;
  }

  async delete(userId: string, id: string) {
    const db = this.database.getDb();
    const result = await db
      .delete(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .returning();
    
    return result.length > 0;
  }

  async listRepositories(userId: string, workspaceId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: repositories.id,
        workspaceId: repositories.workspaceId,
        externalId: repositories.externalId,
        fullName: repositories.fullName,
        htmlUrl: repositories.htmlUrl,
        description: repositories.description,
        defaultBranch: repositories.defaultBranch,
        createdAt: repositories.createdAt,
        updatedAt: repositories.updatedAt,
      })
      .from(repositories)
      .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
      .where(and(eq(repositories.workspaceId, workspaceId), eq(workspaces.userId, userId)))
      .orderBy(repositories.fullName);
    
    return result.map(repositoryFromRow);
  }

  async upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const db = this.database.getDb();
    
    const workspaceId = input.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('invalid_workspace_query');
    }

    const result = await db
      .insert(repositories)
      .values({
        id: input.id || crypto.randomUUID(),
        workspaceId: workspaceId,
        externalId: typeof input.externalId === 'string' ? Number(input.externalId) : input.externalId,
        fullName: input.fullName,
        htmlUrl: input.htmlUrl,
        description: input.description,
        defaultBranch: input.defaultBranch,
      })
      .onConflictDoUpdate({
        target: [repositories.workspaceId, repositories.externalId],
        set: {
          fullName: input.fullName,
          htmlUrl: input.htmlUrl,
          description: input.description,
          defaultBranch: input.defaultBranch,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return repositoryFromRow(result[0]);
  }

  private async resolveProjectPage(userId: string, selectedSlug: string, pageSize: number) {
    const db = this.database.getDb();
    const selectedFavoriteSql = sql`(select is_favorite from kb_projects where user_id = ${userId} and project_slug = ${selectedSlug})`;
    
    const result = await db
      .select({
        idx: count(),
      })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.enabled, true),
          or(
            gt(projects.isFavorite, selectedFavoriteSql),
            and(
              eq(projects.isFavorite, selectedFavoriteSql),
              lte(projects.projectSlug, selectedSlug)
            )
          )
        )
      );

    const index = Number(result[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / pageSize) : 1;
  }
}
