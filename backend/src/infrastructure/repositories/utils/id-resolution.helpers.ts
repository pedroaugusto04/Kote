import { eq, and } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { isUuid } from '../../../domain/utils/uuid.utils.js';
import { PostgresDatabase } from '../../persistence/database.js';
import { workspaces, projects } from '../../persistence/schema/index.js';

export async function resolveWorkspaceId(
  database: PostgresDatabase,
  userId: string,
  workspaceSlugOrId: string,
): Promise<string> {
  if (isUuid(workspaceSlugOrId)) {
    return workspaceSlugOrId;
  }

  const db = database.getDb();
  const result = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), eq(workspaces.workspaceSlug, workspaceSlugOrId)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundException('workspace_not_found');
  }
  return result[0].id;
}

export async function resolveProjectId(
  database: PostgresDatabase,
  userId: string,
  projectSlugOrId: string,
): Promise<string> {
  if (isUuid(projectSlugOrId)) {
    return projectSlugOrId;
  }

  const db = database.getDb();
  const result = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.projectSlug, projectSlugOrId)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundException('project_not_found');
  }
  return result[0].id;
}

export async function resolveIds(
  database: PostgresDatabase,
  userId: string,
  projectSlug: string | null,
  workspaceSlug: string,
): Promise<{ projectId: string | null; workspaceId: string | null }> {
  let workspaceId: string | null = null;
  if (workspaceSlug) {
    try {
      workspaceId = await resolveWorkspaceId(database, userId, workspaceSlug);
    } catch {
      // Workspace not found - return null
      workspaceId = null;
    }
  }

  let projectId: string | null = null;
  if (projectSlug) {
    try {
      projectId = await resolveProjectId(database, userId, projectSlug);
    } catch {
      // Project not found - return null (matches original behavior in note.repository.ts)
      projectId = null;
    }
  }

  return { projectId, workspaceId };
}
