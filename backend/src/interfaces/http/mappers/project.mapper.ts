import type {
  CreateProjectBody,
  UpdateProjectBody,
  ExportProjectNotesZipQuery,
  ProjectDecisionsQuery,
  ExportProjectAdrsQuery,
  ProjectKnowledgeMapQuery,
  ProjectTimelineQuery,
} from '../dto/project.dto.js';
import type { CreateProjectDto, UpdateProjectDto } from '../../../application/dto/project.dto.js';
import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';

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

export function toExportProjectNotesZipInput(query: ExportProjectNotesZipQuery, scope?: WorkspaceScope) {
  return {
    projectSlug: scope?.projectSlug ?? query.projectSlug,
    projectId: scope?.projectId || undefined,
    folderId: query.folderId,
    category: query.category,
    status: query.status,
    query: query.query,
  };
}

export function toListProjectTimelineInput(query: ProjectTimelineQuery, scope?: WorkspaceScope) {
  return {
    ...query,
    ...(scope?.projectId ? { projectId: scope.projectId } : {}),
    orderByPin: query.orderByPin ?? true,
  };
}

export function toListProjectKnowledgeMapInput(query: ProjectKnowledgeMapQuery, scope: WorkspaceScope) {
  return {
    ...query,
    projectId: scope.projectId!,
  };
}

export function toListProjectDecisionsInput(query: ProjectDecisionsQuery, scope: WorkspaceScope) {
  return {
    projectSlug: scope.projectSlug!,
    status: query.status,
    file: query.file,
    search: query.search,
    kind: query.kind,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function toExportProjectAdrsInput(query: ExportProjectAdrsQuery, scope: WorkspaceScope) {
  return {
    projectSlug: scope.projectSlug!,
    status: query.status,
    file: query.file,
    search: query.search,
    kind: query.kind,
  };
}
