import { Injectable } from '@nestjs/common';
import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../application/models/project-knowledge-map.models.js';
import type { ListProjectTimelineInput } from '../../application/models/project-timeline.models.js';
import type { ListProjectsInput, PaginatedProjects } from '../../application/models/project-list.models.js';
import type { Project } from '../../domain/projects.js';
import { ContentObjectStorageService } from '../../application/services/content/content-object-storage.service.js';
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
import { PostgresDatabase } from '../persistence/database.js';


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
    private readonly database: PostgresDatabase,
  ) {
    super();
  }

  async listCategories(userId: string, workspaceId: string) {
    return this.categoryRepository.list(userId, workspaceId);
  }

  async getCategoryById(userId: string, categoryId: string, tx?: any) {
    return this.categoryRepository.getById(userId, categoryId, tx);
  }

  async createCategory(
    userId: string,
    workspaceId: string,
    input: { name: string; color?: string; colorDark?: string; icon?: string; isSystem?: boolean },
    tx?: any
  ) {
    return this.categoryRepository.create(userId, workspaceId, input, tx);
  }

  async findCategoryByName(userId: string, workspaceId: string, name: string, tx?: any) {
    return this.categoryRepository.findByName(userId, workspaceId, name, tx);
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

  async upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, tx?: any) {
    return this.projectRepository.upsertRepository(input, tx);
  }

  async listProjects(userId: string) {
    return this.projectRepository.list(userId);
  }

  async listProjectsWithNoteCount(userId: string) {
    return this.projectRepository.listWithNoteCount(userId);
  }

  async listProjectsPage(userId: string, input: ListProjectsInput): Promise<PaginatedProjects> {
    const pageResult = await this.projectRepository.listPage(userId, input);
    return pageResult as PaginatedProjects;
  }

  async listProjectsPageWithNoteCount(userId: string, input: ListProjectsInput): Promise<PaginatedProjects> {
    const pageResult = await this.projectRepository.listPageWithNoteCount(userId, input);
    return pageResult as PaginatedProjects;
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

  async upsertProjectWithRepository(userId: string, projectInput: SaveProjectInput, repositoryInput?: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, tx?: any): Promise<SaveProjectInput> {
    const dbOrTx = tx || this.database.getDb();

    // Upsert repository first if provided
    if (repositoryInput) {
      await this.projectRepository.upsertRepository(repositoryInput, dbOrTx);
    }

    // Then upsert project
    return this.projectRepository.upsert(userId, projectInput);
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
    const db = this.noteRepository['database'].getDb();
    await db.transaction(async (tx) => {
      for (const folder of input.folders) {
        await this.folderRepository.upsertWithClient(tx, userId, folder);
      }
      for (const write of noteWrites) {
        await this.noteRepository.updateWithClient(tx, userId, write.note, write.markdownStorageKey);
      }
    });
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

  async listNotesLite(userId: string, filters?: { projectId?: string; workspaceId?: string }) {
    return this.noteRepository.listLite(userId, filters);
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

  async getNoteById(userId: string, id: string, tx?: any) {
    return this.noteRepository.getById(userId, id, tx);
  }

  async getNoteByPath(userId: string, path: string, tx?: any) {
    return this.noteRepository.getByPath(userId, path, tx);
  }

  async getNotesByIds(userId: string, ids: string[]) {
    return this.noteRepository.getByIds(userId, ids);
  }

  async getNoteBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    return this.noteRepository.getBySourceAndSessionId(userId, source, sessionId);
  }

  async upsertNote(userId: string, input: SaveNoteInput, tx?: any) {
    return this.noteRepository.upsert(userId, input, tx);
  }

  async updateNote(userId: string, input: SaveNoteInput, tx?: any) {
    return this.noteRepository.update(userId, input, tx);
  }

  async updateNoteBodySearchText(userId: string, noteId: string, bodySearchText: string) {
    await this.noteRepository.updateBodySearchText(userId, noteId, bodySearchText);
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

  async saveAttachment(userId: string, input: SaveAttachmentInput, tx?: any) {
    return this.attachmentRepository.save(userId, input, tx);
  }

  async deleteAttachment(userId: string, noteId: string, fileName: string) {
    return this.attachmentRepository.deleteByNoteIdAndFileName(userId, noteId, fileName);
  }

  async listAttachments(userId: string, noteId: string, tx?: any) {
    return this.attachmentRepository.list(userId, noteId, tx);
  }

  async getProductivityInsightsRaw(userId: string): Promise<ProductivityInsightsRaw> {
    return this.noteRepository.getProductivityInsightsRaw(userId);
  }
}
