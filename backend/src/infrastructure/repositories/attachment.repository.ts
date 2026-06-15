import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { calculateAttachmentSize } from '../../domain/strings.js';
import type { AttachmentRecord, SaveAttachmentInput } from '../../application/models/repository-records.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { attachmentFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { INSERT_ATTACHMENT_SQL } from './content/attachment.queries.js';

@Injectable()
export class PostgresAttachmentRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  async save(userId: string, input: SaveAttachmentInput) {
    const attachmentId = input.id || crypto.randomUUID();
    const noteResult = await this.database.getPool().query(
      'select workspace_slug from kb_notes where user_id = $1 and id = $2 limit 1',
      [userId, input.noteId]
    );
    const workspaceSlug = noteResult.rows[0]?.workspace_slug || 'default';
    const storageKey = await this.contentObjectStorage.saveAttachmentData(userId, workspaceSlug, input);
    const sizeBytes = calculateAttachmentSize(input.sizeBytes, input.dataBase64);
    const result = await this.database.getPool().query(
      INSERT_ATTACHMENT_SQL,
      [
        attachmentId,
        userId,
        input.noteId,
        input.fileName,
        input.mimeType,
        sizeBytes,
        storageKey,
        input.checksumSha256,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return attachmentFromRow(result.rows[0]);
  }

  async list(userId: string, noteId: string) {
    const result = await this.database.getPool().query(
      'select * from kb_attachments where user_id = $1 and note_id = $2 order by created_at',
      [userId, noteId]
    );
    return result.rows.map(attachmentFromRow);
  }

  async listByNoteId(userId: string, noteId: string) {
    const result = await this.database.getPool().query(
      'select storage_key from kb_attachments where user_id = $1 and note_id = $2',
      [userId, noteId]
    );
    return result.rows.map((row) => row.storage_key || '');
  }

  async deleteByNoteId(userId: string, noteId: string) {
    const result = await this.database.getPool().query(
      'select storage_key from kb_attachments where user_id = $1 and note_id = $2',
      [userId, noteId]
    );
    const keys = result.rows.map((row) => row.storage_key || '');
    await this.database.getPool().query(
      'delete from kb_attachments where user_id = $1 and note_id = $2',
      [userId, noteId]
    );
    await this.contentObjectStorage.deleteObjects(keys);
  }
}
