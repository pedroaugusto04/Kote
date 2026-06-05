import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';

@Injectable()
export class FindRelatedNotesUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
  ) {}

  async execute(userId: string, noteId: string, limit = 3) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) throw new NotFoundException('note_not_found');

    const embeddings = await this.noteEmbeddingRepository.getNoteEmbeddings(userId, noteId);
    if (!embeddings.length) {
      return [];
    }

    // Use the first chunk's embedding (which represents the start/title/core content)
    const queryEmbedding = embeddings[0].embedding;

    // Find similar chunks in the workspace (we search up to 20 chunks to have enough variety after deduplication)
    const similarChunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
      limit: 20,
      minSimilarity: 0.35,
    });

    // Deduplicate by noteId, excluding the current note
    const uniqueNoteIds = new Set<string>();

    for (const chunk of similarChunks) {
      if (chunk.noteId === noteId) continue;
      uniqueNoteIds.add(chunk.noteId);
      if (uniqueNoteIds.size >= limit) {
        break;
      }
    }

    const sortedNoteIds = Array.from(uniqueNoteIds);

    if (!sortedNoteIds.length) {
      return [];
    }

    const matchedNotes = await this.contentRepository.getNotesByIds(userId, sortedNoteIds);

    // Map and preserve the order of similarity
    const notesMap = new Map(matchedNotes.map((n) => [n.id, n]));
    const result = sortedNoteIds
      .map((id) => notesMap.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => noteSummary(n));

    return result;
  }
}
