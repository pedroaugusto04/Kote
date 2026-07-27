import { Injectable } from '@nestjs/common';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { NoteContextRepository } from '../../application/ports/notes/note-context.repository.js';
import { NoteRecord } from '../../application/models/repository-records.models.js';
import { PostgresDatabase } from '../persistence/database.js';
import { ContentObjectStorageService } from '../../application/services/content/content-object-storage.service.js';
import { notes, projects, noteLinks } from '../persistence/schema/index.js';
import { noteFromRow } from '../mappers/row.mappers.js';

@Injectable()
export class PostgresNoteContextRepository implements NoteContextRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  async findNotesByFile(userId: string, filePath: string, options?: { limit?: number }): Promise<NoteRecord[]> {
    const db = this.database.getDb();
    const limit = options?.limit ?? 15;

    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        projectSlug: projects.projectSlug,
        folderId: notes.folderId,
        status: notes.status,
        tags: notes.tags,
        occurredAt: notes.occurredAt,
        sourceChannel: notes.sourceChannel,
        source: notes.source,
        summary: notes.summary,
        markdownStorageKey: notes.markdownStorageKey,
        metadata: notes.metadata,
        sessionId: notes.sessionId,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .innerJoin(noteLinks, eq(notes.id, noteLinks.noteId))
      .where(
        and(
          eq(notes.userId, userId),
          eq(noteLinks.userId, userId),
          eq(noteLinks.target, filePath)
        )
      )
      .orderBy(desc(notes.occurredAt))
      .limit(limit);

    const records = result.map(noteFromRow);
    
    return Promise.all(records.map(note => this.hydrateMarkdown(note)));
  }
}
