import { Injectable } from '@nestjs/common';

import { NoteContextRepository } from '../../ports/notes/note-context.repository.js';
import { GenerateFileNotesSummaryUseCase } from './generate-file-notes-summary.use-case.js';

export type GenerateFileNotesSummaryByFileInput = {
  filePath: string;
  workspaceSlug?: string;
  projectSlug?: string;
};

@Injectable()
export class GenerateFileNotesSummaryByFileUseCase {
  constructor(
    private readonly noteContextRepository: NoteContextRepository,
    private readonly generateSummary: GenerateFileNotesSummaryUseCase,
  ) {}

  async execute(userId: string, input: GenerateFileNotesSummaryByFileInput) {
    const notes = await this.noteContextRepository.findNotesByFile(userId, input.filePath, {
      limit: 50,
      projectSlug: input.projectSlug,
    });

    return this.generateSummary.execute(userId, {
      filePath: input.filePath,
      workspaceSlug: input.workspaceSlug,
      projectSlug: input.projectSlug,
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        date: note.occurredAt || note.createdAt || '',
        content: note.markdown || note.summary || '',
        summary: note.summary,
        workspaceSlug: note.workspaceSlug,
        revision: note.updatedAt,
      })),
    });
  }
}
