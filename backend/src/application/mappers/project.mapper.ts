import crypto from 'node:crypto';

import type { CreateProjectDto, UpdateProjectDto } from '../dto/project.dto.js';
import type { ProjectRecord, RepositoryRecord } from '../models/repository-records.models.js';

export function toProjectRecord(
  dto: CreateProjectDto,
  workspaceId: string,
  workspaceSlug: string,
  repositories: RepositoryRecord[],
): ProjectRecord {
  return {
    id: crypto.randomUUID(),
    projectSlug: dto.projectSlug,
    displayName: dto.displayName,
    workspaceId,
    workspaceSlug,
    repositories,
    defaultTags: dto.defaultTags,
    enabled: true,
    favorite: false,
  };
}

export function toProjectUpdateRecord(
  dto: UpdateProjectDto,
  existing: ProjectRecord,
  repositories: RepositoryRecord[],
): Partial<ProjectRecord> {
  return {
    displayName: dto.displayName,
    repositories,
    defaultTags: dto.defaultTags,
  };
}
