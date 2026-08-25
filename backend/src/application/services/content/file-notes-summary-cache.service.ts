import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

type FileNotesSummaryCacheEntry = {
  summary: string;
  understanding: string;
  timeline: Array<{ date: string; title: string; description: string; noteId: string }>;
  keyChanges: Array<{ description: string; noteId: string }>;
  cachedAt: number;
  notesHash: string;
};

type FileNotesSummaryResponse = {
  summary: string;
  understanding: string;
  timeline: Array<{ date: string; title: string; description: string; noteId: string }>;
  keyChanges: Array<{ description: string; noteId: string }>;
};

export type FileNotesSummaryCacheScope = {
  userId: string;
  workspaceSlug: string;
  projectSlug?: string;
  filePath: string;
};

@Injectable()
export class FileNotesSummaryCacheService {
  private cache = new Map<string, FileNotesSummaryCacheEntry>();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day)

  private generateNotesHash(notes: Array<{ id: string; date: string; revision?: string }>): string {
    const sorted = [...notes].sort((left, right) => left.id.localeCompare(right.id));
    const hashInput = sorted.map((note) => `${note.id}:${note.date}:${note.revision || ''}`).join('|');
    return createHash('sha256').update(hashInput).digest('base64url');
  }

  private generateKey(
    scope: FileNotesSummaryCacheScope,
    notes: Array<{ id: string; date: string; revision?: string }>,
  ): string {
    return [scope.userId, scope.workspaceSlug, scope.projectSlug || '', scope.filePath, this.generateNotesHash(notes)].join(':');
  }

  get(scope: FileNotesSummaryCacheScope, notes: Array<{ id: string; date: string; revision?: string }>): FileNotesSummaryCacheEntry | null {
    const key = this.generateKey(scope, notes);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if cache entry is expired
    if (Date.now() - entry.cachedAt > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  set(
    scope: FileNotesSummaryCacheScope,
    notes: Array<{ id: string; date: string; revision?: string }>,
    summary: FileNotesSummaryResponse,
  ): void {
    const notesHash = this.generateNotesHash(notes);
    const key = this.generateKey(scope, notes);
    
    this.cache.set(key, {
      ...summary,
      cachedAt: Date.now(),
      notesHash,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > this.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
