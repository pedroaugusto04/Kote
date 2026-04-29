import type { ReminderView } from '../models/reminder.models.js';
import type {
  AttachmentRecord,
  NoteRecord,
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectInput,
  SaveWorkspaceInput,
} from '../models/repository-records.models.js';
import type { ReviewView } from '../models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../models/vault-note.models.js';

export abstract class ContentRepository {
  abstract listWorkspaces(userId: string): Promise<SaveWorkspaceInput[]>;
  abstract upsertWorkspace(userId: string, input: SaveWorkspaceInput): Promise<SaveWorkspaceInput>;
  abstract listProjects(userId: string): Promise<SaveProjectInput[]>;
  abstract getProjectBySlug(userId: string, projectSlug: string): Promise<SaveProjectInput | null>;
  abstract upsertProject(userId: string, input: SaveProjectInput): Promise<SaveProjectInput>;
  abstract deleteProject(userId: string, projectSlug: string): Promise<boolean>;
  abstract listNotes(userId: string): Promise<NoteRecord[]>;
  abstract getNoteById(userId: string, id: string): Promise<NoteRecord | null>;
  abstract getNoteByPath(userId: string, path: string): Promise<NoteRecord | null>;
  abstract findReminderBySourceNotePath(userId: string, sourceNotePath: string): Promise<NoteRecord | null>;
  abstract upsertNote(userId: string, input: SaveNoteInput): Promise<NoteRecord>;
  abstract deleteNote(userId: string, id: string): Promise<boolean>;
  abstract saveAttachment(userId: string, input: SaveAttachmentInput): Promise<AttachmentRecord>;
  abstract listAttachments(userId: string, noteId: string): Promise<AttachmentRecord[]>;
}

export abstract class ContentQueryRepository {
  abstract list(userId: string): Promise<VaultNoteSummary[]>;
  abstract getById(userId: string, id: string): Promise<VaultNoteDetail | null>;
  abstract listReviews(userId: string): Promise<ReviewView[]>;
  abstract listReminders(userId: string): Promise<ReminderView[]>;
}
