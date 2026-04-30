import { Injectable } from '@nestjs/common';

import type { NoteRecord, SaveAttachmentInput, SaveNoteInput } from '../models/repository-records.models.js';
import { ObjectStorage } from '../ports/object-storage.js';

function normalizedObjectPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').map((segment) => segment.trim()).filter(Boolean).join('/');
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\\/\u0000-\u001f\u007f]+/g, '_');
  return normalized || 'attachment';
}

function noteStorageKey(userId: string, workspaceSlug: string, notePath: string): string {
  return `users/${userId}/workspaces/${workspaceSlug || 'default'}/notes/${normalizedObjectPath(notePath)}`;
}

function attachmentStorageKey(userId: string, workspaceSlug: string, noteId: string, fileName: string): string {
  return `users/${userId}/workspaces/${workspaceSlug || 'default'}/attachments/${noteId}/${safeFileName(fileName)}`;
}

@Injectable()
export class ContentObjectStorageService {
  constructor(private readonly objectStorage: ObjectStorage) {}

  async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    if (!note.markdownStorageKey) return note;
    const markdown = await this.objectStorage.get(note.markdownStorageKey);
    return { ...note, markdown: markdown.toString('utf8') };
  }

  async saveNoteMarkdown(userId: string, input: SaveNoteInput): Promise<string> {
    const markdownStorageKey = input.markdownStorageKey || noteStorageKey(userId, input.workspaceSlug, input.path);
    await this.objectStorage.put({
      key: markdownStorageKey,
      body: input.markdown,
      contentType: 'text/markdown; charset=utf-8',
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
