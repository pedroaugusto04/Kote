import { Injectable } from '@nestjs/common';
import { NoteContextRepository } from '../../ports/notes/note-context.repository.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import { AppLogger } from '../../../observability/logger.js';
import type {
  FindNotesBySnippetInput,
  SnippetNoteMatch,
  SnippetNotesResponse,
} from '../../dto/snippet-notes.dto.js';
import {
  extractCodeTokens,
  computeSnippetRelevance,
} from '../../utils/notes/snippet-notes.utils.js';

@Injectable()
export class FindNotesBySnippetUseCase {
  constructor(
    private readonly noteContextRepository: NoteContextRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, input: FindNotesBySnippetInput): Promise<SnippetNotesResponse> {
    const { filePath, codeSnippet = '', gitContext, limit = 20 } = input;

    this.logger.info('find_notes_by_snippet.start', {
      userId,
      filePath,
      hasSnippet: Boolean(codeSnippet),
      commitHash: gitContext?.commitHash,
      commitDate: gitContext?.commitDate,
    });

    const fileNotes = await this.noteContextRepository.findNotesByFile(userId, filePath, { limit: 50 });

    if (fileNotes.length === 0) {
      return {
        ok: true,
        filePath,
        gitContext,
        matches: [],
        total: 0,
      };
    }

    const snippetTokens = extractCodeTokens(codeSnippet);
    const commitTokens = extractCodeTokens(gitContext?.commitMessage);
    const allQueryTokens = Array.from(new Set([...snippetTokens, ...commitTokens]));

    const scoredNotes = fileNotes.map((note) => {
      const relevance = computeSnippetRelevance(note, allQueryTokens, gitContext);
      return {
        noteRecord: note,
        relevance,
      };
    });

    // Sort chronologically from newest to oldest (occurredAt DESC)
    scoredNotes.sort((a, b) => {
      const timeA = new Date(a.noteRecord.occurredAt || a.noteRecord.createdAt || 0).getTime();
      const timeB = new Date(b.noteRecord.occurredAt || b.noteRecord.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const topMatches = scoredNotes.slice(0, limit);

    const matches: SnippetNoteMatch[] = topMatches.map(({ noteRecord, relevance }) => ({
      note: noteSummary(noteRecord),
      relevance,
    }));

    return {
      ok: true,
      filePath,
      gitContext,
      matches,
      total: matches.length,
    };
  }
}
