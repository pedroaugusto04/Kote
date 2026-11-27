
import {
  AppErrorCode,
  FolderNotFoundException,
  NoteNotFoundException,
  ProjectHasNotesException,
  ProjectNotFoundException,
  ResourceConflictException,
  WorkspaceNotFoundException,
} from '../../domain/exceptions/index.js';
import type { ContentRepository } from '../ports/notes/content.repository.js';
import type { ProjectRecord, WorkspaceRecord, NoteRecord, ProjectFolderRecord } from '../models/repository-records.models.js';

export async function requireProject(
  repository: ContentRepository,
  userId: string,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await repository.getProjectById(userId, projectId);
  if (!project) {
    throw new ProjectNotFoundException();
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
    throw new WorkspaceNotFoundException();
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
    throw new NoteNotFoundException();
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
    throw new FolderNotFoundException(AppErrorCode.ProjectFolderNotFound);
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
  const notes = await repository.listNotesLite(userId);
  if (notes.some((note) => note.projectId === projectId)) {
    throw new ProjectHasNotesException();
  }
}

export async function assertProjectSlugUnique(
  repository: ContentRepository,
  userId: string,
  projectSlug: string,
): Promise<void> {
  const projects = await repository.listProjects(userId);
  if (projects.some((project) => project.projectSlug === projectSlug)) {
    throw new ResourceConflictException(AppErrorCode.ProjectSlugAlreadyExists, {
      details: { fieldErrors: { projectSlug: 'This project slug already exists.' } },
    });
  }
}

export async function assertWorkspaceSlugUnique(
  repository: ContentRepository,
  userId: string,
  workspaceSlug: string,
): Promise<void> {
  const workspaces = await repository.listWorkspaces(userId);
  if (workspaces.some((workspace) => workspace.workspaceSlug === workspaceSlug)) {
    throw new ResourceConflictException(AppErrorCode.WorkspaceSlugAlreadyExists, {
      details: { fieldErrors: { workspaceSlug: 'This workspace slug already exists.' } },
    });
  }
}
