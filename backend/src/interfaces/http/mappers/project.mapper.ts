import type { CreateProjectBody, UpdateProjectBody } from '../dto/project.dto.js';
import type { CreateProjectDto, UpdateProjectDto } from '../../../application/dto/project.dto.js';

export function toCreateProjectDto(httpBody: CreateProjectBody): CreateProjectDto {
  return {
    displayName: httpBody.displayName,
    projectSlug: httpBody.projectSlug,
    repositoryIds: httpBody.repositoryIds,
    defaultTags: httpBody.defaultTags,
  };
}

export function toUpdateProjectDto(httpBody: UpdateProjectBody, projectId: string): UpdateProjectDto {
  return {
    projectId,
    displayName: httpBody.displayName,
    repositoryIds: httpBody.repositoryIds,
    defaultTags: httpBody.defaultTags,
  };
}
