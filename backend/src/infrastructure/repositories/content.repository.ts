import { Injectable } from '@nestjs/common';
import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../application/models/project-knowledge-map.models.js';
import type { ListProjectTimelineInput } from '../../application/models/project-timeline.models.js';
import type { ListProjectsInput, PaginatedProjects } from '../../application/models/project-list.models.js';
import type { Project } from '../../domain/projects.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { ContentRepository } from '../../application/ports/notes/content.repository.js';
import type {
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectFolderInput,
  SaveProjectInput,
  SaveWorkspaceInput,
} from '../../application/models/repository-records.models.js';
import type { RepositoryRecord } from '../../application/models/repository-records.models.js';
import { PostgresWorkspaceRepository } from './workspace.repository.js';
import { PostgresProjectRepository } from './project.repository.js';
import { PostgresNoteRepository } from './note.repository.js';
import { PostgresFolderRepository } from './folder.repository.js';
import { PostgresAttachmentRepository } from './attachment.repository.js';
import { PostgresCategoryRepository } from './category.repository.js';
import type { ProductivityInsightsRaw } from '../../application/models/productivity.models.js';


@Injectable()
export class PostgresContentRepository extends ContentRepository {
  constructor(
    private readonly workspaceRepository: PostgresWorkspaceRepository,
    private readonly projectRepository: PostgresProjectRepository,
    private readonly noteRepository: PostgresNoteRepository,
    private readonly folderRepository: PostgresFolderRepository,
    private readonly attachmentRepository: PostgresAttachmentRepository,
    private readonly categoryRepository: PostgresCategoryRepository,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {
    super();
  }

  async listCategories(userId: string, workspaceId: string) {
    return this.categoryRepository.list(userId, workspaceId);
  }

  async getCategoryById(userId: string, categoryId: string) {
    return this.categoryRepository.getById(userId, categoryId);
  }

  async createCategory(
    userId: string,
    workspaceId: string,
    input: { name: string; color?: string; colorDark?: string; icon?: string; isSystem?: boolean }
  ) {
    return this.categoryRepository.create(userId, workspaceId, input);
  }

  async findCategoryByName(userId: string, workspaceId: string, name: string) {
    return this.categoryRepository.findByName(userId, workspaceId, name);
  }

  async listWorkspaces(userId: string) {
    return this.workspaceRepository.list(userId);
  }

  async getWorkspaceBySlug(userId: string, workspaceSlug: string) {
    return this.workspaceRepository.getBySlug(userId, workspaceSlug);
  }

  async upsertWorkspace(userId: string, input: SaveWorkspaceInput) {
    return this.workspaceRepository.upsert(userId, input);
  }

  async listRepositories(userId: string, workspaceId: string) {
    return this.projectRepository.listRepositories(userId, workspaceId);
  }

  async upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    return this.projectRepository.upsertRepository(input);
  }

  async listProjects(userId: string) {
    return this.projectRepository.list(userId);
  }

  async listProjectsPage(userId: string, input: ListProjectsInput): Promise<PaginatedProjects> {
    const pageResult = await this.projectRepository.listPage(userId, input);
    return {
      pagination: pageResult.pagination,
      items: pageResult.items.map((record) => ({
        projectSlug: record.projectSlug,
        displayName: record.displayName,
        workspaceSlug: record.workspaceSlug || '',
        repositories: record.repositories.map((repo) => ({
          id: repo.id,
          workspaceSlug: record.workspaceSlug || '',
          externalId: repo.externalId,
          fullName: repo.fullName,
          htmlUrl: repo.htmlUrl,
          description: repo.description,
          defaultBranch: repo.defaultBranch,
          createdAt: repo.createdAt,
          updatedAt: repo.updatedAt,
        })),
        defaultTags: record.defaultTags,
        enabled: record.enabled,
        favorite: record.favorite,
      })),
    };
  }

  async getProjectBySlug(userId: string, projectSlug: string) {
    return this.projectRepository.getBySlug(userId, projectSlug);
  }

  async getProjectById(userId: string, projectId: string) {
    return this.projectRepository.getById(userId, projectId);
  }

  async upsertProject(userId: string, input: SaveProjectInput) {
    return this.projectRepository.upsert(userId, input);
  }

  async deleteProject(userId: string, projectId: string) {
    return this.projectRepository.delete(userId, projectId);
  }

  async setProjectFavorite(userId: string, projectId: string, favorite: boolean) {
    return this.projectRepository.setFavorite(userId, projectId, favorite);
  }

  async listProjectFolders(userId: string, projectId: string) {
    return this.folderRepository.list(userId, projectId);
  }

  async getProjectFolderById(userId: string, projectId: string, folderId: string) {
    return this.folderRepository.getById(userId, projectId, folderId);
  }

  async upsertProjectFolder(userId: string, input: SaveProjectFolderInput) {
    return this.folderRepository.upsert(userId, input);
  }

  async updateProjectFolderTree(userId: string, input: { folders: SaveProjectFolderInput[]; notes: SaveNoteInput[] }) {
    const noteWrites = await Promise.all(input.notes.map(async (note) => ({
      note,
      previousMarkdownStorageKey: note.markdownStorageKey || '',
      markdownStorageKey: await this.contentObjectStorage.saveNoteMarkdown(userId, { ...note, markdownStorageKey: undefined }),
    })));
    const client = await this.noteRepository['database'].getPool().connect();
    try {
      await client.query('BEGIN');
      for (const folder of input.folders) {
        await this.folderRepository.upsertWithClient(client, userId, folder);
      }
      for (const write of noteWrites) {
        await this.noteRepository.updateWithClient(client, userId, write.note, write.markdownStorageKey);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.contentObjectStorage.deleteObjects(
      noteWrites
        .filter((write) => write.previousMarkdownStorageKey && write.previousMarkdownStorageKey !== write.markdownStorageKey)
        .map((write) => write.previousMarkdownStorageKey),
    );
  }

  async deleteProjectFolder(userId: string, projectId: string, folderId: string) {
    return this.folderRepository.delete(userId, projectId, folderId);
  }

  async listNotes(userId: string, filters?: { projectId?: string; workspaceId?: string }) {
    return this.noteRepository.list(userId, filters);
  }

  async listNotesPage(userId: string, input: ListNotesInput) {
    return this.noteRepository.listPage(userId, input);
  }

  async listProjectTimeline(userId: string, input: ListProjectTimelineInput) {
    return this.noteRepository.listProjectTimeline(userId, input);
  }

  async listProjectKnowledgeMapItems(userId: string, input: ListProjectKnowledgeMapInput) {
    return this.noteRepository.listProjectKnowledgeMapItems(userId, input);
  }

  async getNoteById(userId: string, id: string) {
    return this.noteRepository.getById(userId, id);
  }

  async getNoteByPath(userId: string, path: string) {
    return this.noteRepository.getByPath(userId, path);
  }

  async getNotesByIds(userId: string, ids: string[]) {
    return this.noteRepository.getByIds(userId, ids);
  }

  async getNoteBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    return this.noteRepository.getBySourceAndSessionId(userId, source, sessionId);
  }

  async upsertNote(userId: string, input: SaveNoteInput) {
    return this.noteRepository.upsert(userId, input);
  }

  async updateNote(userId: string, input: SaveNoteInput) {
    return this.noteRepository.update(userId, input);
  }

  async updateReminderStatus(userId: string, id: string, status: string) {
    return this.noteRepository.updateReminderStatus(userId, id, status);
  }

  async updateNoteStatuses(userId: string, ids: string[], status: string) {
    return this.noteRepository.updateStatuses(userId, ids, status);
  }

  async updateReminderStatuses(userId: string, ids: string[], status: string) {
    return this.noteRepository.updateReminderStatuses(userId, ids, status);
  }

  async setNotePinned(userId: string, id: string, pinned: boolean) {
    return this.noteRepository.setPinned(userId, id, pinned);
  }

  async deleteNote(userId: string, id: string) {
    const note = await this.noteRepository.getById(userId, id);
    if (!note) return false;
    const attachmentStorageKeys = await this.attachmentRepository.listByNoteId(userId, id);
    const deleted = await this.noteRepository.delete(userId, id, note.markdownStorageKey);
    if (deleted && attachmentStorageKeys.length > 0) {
      await this.contentObjectStorage.deleteObjects(attachmentStorageKeys);
    }
    return deleted;
  }

  async saveAttachment(userId: string, input: SaveAttachmentInput) {
    return this.attachmentRepository.save(userId, input);
  }

  async listAttachments(userId: string, noteId: string) {
    return this.attachmentRepository.list(userId, noteId);
  }

  async getProductivityInsightsRaw(userId: string): Promise<ProductivityInsightsRaw> {
    return this.noteRepository.getProductivityInsightsRaw(userId);
  }
}
