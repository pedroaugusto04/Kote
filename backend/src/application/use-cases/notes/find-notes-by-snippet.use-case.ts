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
import { classifyDirectLineageMatch } from '../../utils/notes/code-lineage.utils.js';

@Injectable()
export class FindNotesBySnippetUseCase {
  constructor(
    private readonly noteContextRepository: NoteContextRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, input: FindNotesBySnippetInput): Promise<SnippetNotesResponse> {
    const { filePath, codeSnippet = '', gitContext, projectSlug, limit = 20 } = input;

    this.logger.info('find_notes_by_snippet.start', {
      userId,
      filePath,
      projectSlug,
      hasSnippet: Boolean(codeSnippet),
      commitHash: gitContext?.commitHash,
      commitDate: gitContext?.commitDate,
    });

    const commitHashes = [gitContext?.commitHash, ...(gitContext?.commitHashes || [])]
      .map((hash) => String(hash || '').trim())
      .filter(Boolean);
    const fileNotes = await this.noteContextRepository.findNotesByFile(userId, filePath, {
      limit: 200,
      projectSlug,
      commitHashes,
    });

    if (fileNotes.length === 0) {
      return {
        ok: true,
        filePath,
        gitContext,
        matches: [],
        total: 0,
      };
    }

    // Rank file-linked notes from the code the user selected. Commit text is
    // contextual evidence for the UI, not a competing search query.
    const snippetTokens = extractCodeTokens(codeSnippet);

    const scoredNotes = fileNotes.map((note) => {
      const relevance = computeSnippetRelevance(note, snippetTokens, gitContext);
      const category = classifyDirectLineageMatch(note, relevance);
      return {
        noteRecord: note,
        relevance: category ? { ...relevance, category } : null,
      };
    }).filter((match): match is typeof match & { relevance: NonNullable<typeof match.relevance> } => (
      match.relevance !== null
    ));

    // Sort by relevance score DESC (origin match first, then highest score, then newest date)
    scoredNotes.sort((a, b) => {
      if (a.relevance.isOriginMatch !== b.relevance.isOriginMatch) {
        return a.relevance.isOriginMatch ? -1 : 1;
      }
      if (b.relevance.score !== a.relevance.score) {
        return b.relevance.score - a.relevance.score;
      }
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
