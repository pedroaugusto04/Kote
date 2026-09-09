import { Injectable } from '@nestjs/common';

import { buildNoteEditorState } from '../notes/note-editor.helpers.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { IntegrationProvider } from '../../../contracts/enums.js';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly contentRepository: ContentRepository,
    private readonly aiEntitlement: AiEntitlementService,
  ) {}

  async execute(userId: string, id: string) {
    const note = await this.contentQueryRepository.getById(userId, id);
    if (!note) return null;
    const noteRecord = await this.contentRepository.getNoteById(userId, id);
    const isAiSession = note.sourceChannel === SourceChannel.AiChat || note.source === SourceChannel.AiChat;
    const synthesisEnabled = !isAiSession || await this.aiEntitlement.isEnabled(userId, note.workspace, IntegrationProvider.AiSessionSynthesis);
    return {
      ...note,
      synthesis: synthesisEnabled ? note.synthesis : null,
      editor: noteRecord ? buildNoteEditorState(noteRecord) : null,
    };
  }
}
