import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

import type { ContentRepository } from '../ports/notes/content.repository.js';
import type { ProjectRecord, WorkspaceRecord, NoteRecord, ProjectFolderRecord } from '../models/repository-records.models.js';

export async function requireProject(
  repository: ContentRepository,
  userId: string,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await repository.getProjectById(userId, projectId);
  if (!project || !project.enabled) {
    throw new NotFoundException('project_not_found');
  }
  return project;
}

export async function requireWorkspace(
  repository: ContentRepository,
  userId: string,
): Promise<WorkspaceRecord> {
  const workspaces = await repository.listWorkspaces(userId);
  const workspace = workspaces[0];
  if (!workspace) {
    throw new NotFoundException('workspace_not_found');
  }
  return workspace;
}

export async function requireNote(
  repository: ContentRepository,
  userId: string,
  noteId: string,
): Promise<NoteRecord> {
  const note = await repository.getNoteById(userId, noteId);
  if (!note) {
    throw new NotFoundException('note_not_found');
  }
  return note;
}

export async function requireProjectFolder(
  repository: ContentRepository,
  userId: string,
  projectId: string,
  folderId: string,
): Promise<ProjectFolderRecord> {
  const folder = await repository.getProjectFolderById(userId, projectId, folderId);
  if (!folder) {
    throw new NotFoundException('folder_not_found');
  }
  return folder;
}

export async function requireProjectFolderOptional(
  repository: ContentRepository,
  userId: string,
  projectId: string,
  folderId?: string,
): Promise<ProjectFolderRecord | null> {
  if (!folderId) return null;
  return requireProjectFolder(repository, userId, projectId, folderId);
}

export async function assertProjectHasNoNotes(
  repository: ContentRepository,
  userId: string,
  projectId: string,
): Promise<void> {
  const notes = await repository.listNotes(userId);
  if (notes.some((note) => note.projectId === projectId)) {
    throw new BadRequestException('project_has_notes');
  }
}

export async function assertProjectSlugUnique(
  repository: ContentRepository,
  userId: string,
  projectSlug: string,
): Promise<void> {
  const projects = await repository.listProjects(userId);
  if (projects.some((project) => project.enabled && project.projectSlug === projectSlug)) {
    throw new ConflictException({
      code: 'project_slug_already_exists',
      details: { fieldErrors: { projectSlug: 'This project slug already exists.' } },
    });
  }
}
