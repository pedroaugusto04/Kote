import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { slugify } from '../../domain/strings.js';
import type { NoteRecord, SaveAttachmentInput, SaveNoteInput } from '../models/repository-records.models.js';
import { ObjectStorage } from '../ports/notes/object-storage.js';

function safeFileName(fileName: string): string {
  const normalized = String(fileName || '').trim().replace(/[\\/\u0000-\u001f\u007f]+/g, '_');
  if (!normalized) return 'attachment';
  const extensionIndex = normalized.lastIndexOf('.');
  if (extensionIndex <= 0 || extensionIndex === normalized.length - 1) return slugify(normalized) || 'attachment';
  const stem = normalized.slice(0, extensionIndex);
  const extension = normalized.slice(extensionIndex + 1);
  const safeStem = slugify(stem) || 'attachment';
  const safeExtension = slugify(extension).replace(/-/g, '');
  return safeExtension ? `${safeStem}.${safeExtension}` : safeStem;
}

function noteStorageKey(userId: string, workspaceSlug: string, noteId: string): string {
  return `users/${userId}/workspaces/${workspaceSlug || 'default'}/notes/${noteId}`;
}

function attachmentStorageKey(userId: string, workspaceSlug: string, noteId: string, fileName: string): string {
  return `users/${userId}/workspaces/${workspaceSlug || 'default'}/attachments/${noteId}/${safeFileName(fileName)}`;
}

@Injectable()
export class ContentObjectStorageService {
  constructor(private readonly objectStorage: ObjectStorage) { }

  async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    if (!note.markdownStorageKey) return note;
    const markdown = await this.objectStorage.get(note.markdownStorageKey);
    return { ...note, markdown: markdown.toString('utf8') };
  }

  async saveNoteMarkdown(userId: string, input: SaveNoteInput): Promise<string> {
    const markdownStorageKey = input.markdownStorageKey || noteStorageKey(userId, input.workspaceSlug || '', input.id || crypto.randomUUID());
    await this.objectStorage.put({
      key: markdownStorageKey,
      body: input.markdown,
      contentType: 'text/markdown',
    });
    return markdownStorageKey;
  }

  async saveAttachmentData(userId: string, workspaceSlug: string, input: SaveAttachmentInput): Promise<string> {
    const storageKey = input.storageKey || attachmentStorageKey(userId, workspaceSlug, input.noteId, input.fileName);
    if (input.dataBase64 !== undefined) {
      await this.objectStorage.put({
        key: storageKey,
        body: Buffer.from(input.dataBase64 || '', 'base64'),
        contentType: input.mimeType || 'application/octet-stream',
      });
    }
    return storageKey;
  }

  async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.filter(Boolean).map((key) => this.objectStorage.delete(key).catch(() => undefined)));
  }
}
