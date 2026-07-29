import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { PostgresDatabase } from '../persistence/database.js';
import { projectMapClusters } from '../persistence/schema/index.js';

@Injectable()
export class ProjectMapClusterRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async getClusters(userId: string, workspaceId: string, projectId: string) {
    const db = this.database.getDb();
    const [record] = await db
      .select()
      .from(projectMapClusters)
      .where(
        and(
          eq(projectMapClusters.userId, userId),
          eq(projectMapClusters.workspaceId, workspaceId),
          eq(projectMapClusters.projectId, projectId),
        ),
      )
      .limit(1);

    return record ? record.clustersPayload : null;
  }

  async upsertClusters(userId: string, workspaceId: string, projectId: string, payload: unknown) {
    const db = this.database.getDb();
    await db
      .insert(projectMapClusters)
      .values({
        userId,
        workspaceId,
        projectId,
        clustersPayload: payload as any,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectMapClusters.userId, projectMapClusters.workspaceId, projectMapClusters.projectId],
        set: {
          clustersPayload: payload as any,
          updatedAt: new Date(),
        },
      });
  }
}
