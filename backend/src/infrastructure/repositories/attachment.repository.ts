import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';

import { calculateAttachmentSize } from '../../domain/strings.js';
import type { AttachmentRecord, SaveAttachmentInput } from '../../application/models/repository-records.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { attachmentFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { attachments, notes, workspaces } from '../persistence/schema/index.js';

@Injectable()
export class PostgresAttachmentRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  async save(userId: string, input: SaveAttachmentInput, tx?: any): Promise<AttachmentRecord> {
    const dbOrTx = tx || this.database.getDb();

    const sizeBytes = calculateAttachmentSize(input.sizeBytes, input.dataBase64);

    const [noteResult] = await dbOrTx
      .select({ workspaceSlug: workspaces.workspaceSlug })
      .from(notes)
      .innerJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .where(and(eq(notes.userId, userId), eq(notes.id, input.noteId)))
      .limit(1);
    
    if (!noteResult) {
      throw new NotFoundException('note_not_found');
    }
    
    const workspaceSlug = noteResult.workspaceSlug || 'default';
    const storageKey = await this.contentObjectStorage.saveAttachmentData(userId, workspaceSlug, input);

    // Check if attachment with same noteId and fileName already exists
    const [existing] = await dbOrTx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.userId, userId),
          eq(attachments.noteId, input.noteId),
          eq(attachments.fileName, input.fileName)
        )
      )
      .limit(1);

    if (existing) {
      const [result] = await dbOrTx
        .update(attachments)
        .set({
          mimeType: input.mimeType,
          sizeBytes,
          storageKey,
          checksumSha256: input.checksumSha256,
          createdAt: new Date(),
        })
        .where(eq(attachments.id, existing.id))
        .returning();
      
      return attachmentFromRow(result);
    }

    const attachmentId = input.id ?? crypto.randomUUID();
    const [result] = await dbOrTx
      .insert(attachments)
      .values({
        id: attachmentId,
        userId,
        noteId: input.noteId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes,
        storageKey,
        checksumSha256: input.checksumSha256,
      })
      .returning();
    
    return attachmentFromRow(result);
  }

  async list(userId: string, noteId: string, tx?: any) {
    const db = tx || this.database.getDb();
    const result = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.noteId, noteId)))
      .orderBy(desc(attachments.createdAt));
    
    return result.map(attachmentFromRow);
  }

  async listByNoteId(userId: string, noteId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.noteId, noteId)));
    
    return result.map((row) => row.storageKey || '');
  }

  async deleteByNoteId(userId: string, noteId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.noteId, noteId)));
    
    const keys = result.map((row) => row.storageKey || '');
    await db
      .delete(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.noteId, noteId)));
    
    await this.contentObjectStorage.deleteObjects(keys);
  }

  async deleteByNoteIdAndFileName(userId: string, noteId: string, fileName: string) {
    const db = this.database.getDb();
    const result = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(
        and(
          eq(attachments.userId, userId),
          eq(attachments.noteId, noteId),
          eq(attachments.fileName, fileName)
        )
      );

    const keys = result.map((row) => row.storageKey || '').filter(Boolean);
    if (keys.length) {
      await db
        .delete(attachments)
        .where(
          and(
            eq(attachments.userId, userId),
            eq(attachments.noteId, noteId),
            eq(attachments.fileName, fileName)
          )
        );
      await this.contentObjectStorage.deleteObjects(keys);
    }
  }
}
