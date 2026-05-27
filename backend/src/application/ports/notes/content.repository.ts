import type { ReminderDeliveryChannel } from '../../../contracts/enums.js';
import type { DueReminderView, ReminderView } from '../../models/reminder.models.js';
import type {
  AttachmentRecord,
  NoteRecord,
  ProjectFolderRecord,
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectFolderInput,
  SaveProjectInput,
  SaveWorkspaceInput,
  RepositoryRecord,
} from '../../models/repository-records.models.js';
import type { ListNotesInput, PaginatedNotes } from '../../models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../models/project-knowledge-map.models.js';
import type { ListProjectTimelineInput, PaginatedProjectTimeline } from '../../models/project-timeline.models.js';
import type { ListProjectsInput, PaginatedProjects } from '../../models/project-list.models.js';
import type { ReviewView } from '../../models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../../models/vault-note.models.js';

export abstract class ContentRepository {
  abstract listWorkspaces(userId: string): Promise<SaveWorkspaceInput[]>;
  abstract upsertWorkspace(userId: string, input: SaveWorkspaceInput): Promise<SaveWorkspaceInput>;
  abstract listRepositories(userId: string, workspaceSlug: string): Promise<RepositoryRecord[]>;
  abstract upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<RepositoryRecord>;
  abstract listProjects(userId: string): Promise<SaveProjectInput[]>;
  abstract listProjectsPage(userId: string, input: ListProjectsInput): Promise<PaginatedProjects>;
  abstract getProjectBySlug(userId: string, projectSlug: string): Promise<SaveProjectInput | null>;
  abstract upsertProject(userId: string, input: SaveProjectInput): Promise<SaveProjectInput>;
  abstract deleteProject(userId: string, projectSlug: string): Promise<boolean>;
  abstract setProjectFavorite(userId: string, projectSlug: string, favorite: boolean): Promise<SaveProjectInput | null>;
  abstract listProjectFolders(userId: string, projectSlug: string): Promise<ProjectFolderRecord[]>;
  abstract getProjectFolderById(userId: string, projectSlug: string, folderId: string): Promise<ProjectFolderRecord | null>;
  abstract upsertProjectFolder(userId: string, input: SaveProjectFolderInput): Promise<ProjectFolderRecord>;
  abstract updateProjectFolderTree(userId: string, input: { folders: SaveProjectFolderInput[]; notes: SaveNoteInput[] }): Promise<void>;
  abstract deleteProjectFolder(userId: string, projectSlug: string, folderId: string): Promise<boolean>;
  abstract listNotes(userId: string): Promise<NoteRecord[]>;
  abstract listNotesPage(userId: string, input: ListNotesInput): Promise<PaginatedNotes>;
  abstract listProjectTimeline(userId: string, input: ListProjectTimelineInput): Promise<PaginatedProjectTimeline>;
  abstract listProjectKnowledgeMapItems(userId: string, input: ListProjectKnowledgeMapInput): Promise<NoteRecord[]>;
  abstract getNoteById(userId: string, id: string): Promise<NoteRecord | null>;
  abstract getNotesByIds(userId: string, ids: string[]): Promise<NoteRecord[]>;
  abstract getNoteByPath(userId: string, path: string): Promise<NoteRecord | null>;
  abstract upsertNote(userId: string, input: SaveNoteInput): Promise<NoteRecord>;
  abstract updateNote(userId: string, input: SaveNoteInput): Promise<NoteRecord>;
  abstract updateReminderStatus(userId: string, id: string, status: string): Promise<NoteRecord | null>;
  abstract deleteNote(userId: string, id: string): Promise<boolean>;
  abstract saveAttachment(userId: string, input: SaveAttachmentInput): Promise<AttachmentRecord>;
  abstract listAttachments(userId: string, noteId: string): Promise<AttachmentRecord[]>;
}

export abstract class ContentQueryRepository {
  abstract list(userId: string): Promise<VaultNoteSummary[]>;
  abstract getById(userId: string, id: string): Promise<VaultNoteDetail | null>;
  abstract listReviews(userId: string): Promise<ReviewView[]>;
  abstract getReviewById(userId: string, id: string): Promise<ReviewView | null>;
  abstract listReminders(userId: string): Promise<ReminderView[]>;
  abstract listDueRemindersByChannel(channel: ReminderDeliveryChannel, nowIso: string): Promise<DueReminderView[]>;
}
