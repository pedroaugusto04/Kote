import { Injectable } from '@nestjs/common';

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

@Injectable()
export class FileNotesSummaryCacheService {
  private cache = new Map<string, FileNotesSummaryCacheEntry>();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day)

  private generateNotesHash(notes: Array<{ id: string; date: string }>): string {
    // Sort notes by date and create a hash based on IDs and dates
    const sorted = [...notes].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const hashInput = sorted.map((n) => `${n.id}:${n.date}`).join('|');
    return Buffer.from(hashInput).toString('base64');
  }

  get(filePath: string, notes: Array<{ id: string; date: string }>): FileNotesSummaryCacheEntry | null {
    const notesHash = this.generateNotesHash(notes);
    const key = `${filePath}:${notesHash}`;
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
    filePath: string,
    notes: Array<{ id: string; date: string }>,
    summary: FileNotesSummaryResponse,
  ): void {
    const notesHash = this.generateNotesHash(notes);
    const key = `${filePath}:${notesHash}`;
    
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
