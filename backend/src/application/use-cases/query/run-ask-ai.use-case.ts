import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { AskKnowledgeUseCase } from './ask-knowledge.use-case.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ResolveWhatsappAskAttachmentsUseCase } from './resolve-whatsapp-ask-attachments.use-case.js';
import type { WhatsappAskAttachmentMedia } from '../../models/whatsapp-ask-attachment.models.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { toAskConversationTurns, toSaveAskHistoryInput } from '../../mappers/ask.mapper.js';

export type RunAskAiScope = {
  projectId?: string;
  workspaceId?: string;
};

@Injectable()
export class RunAskAiUseCase {
  constructor(
    private readonly askKnowledge: AskKnowledgeUseCase,
    private readonly askHistoryRepository: AskHistoryRepository,
    private readonly contentRepository: ContentRepository,
    private readonly resolveWhatsappAskAttachmentsUseCase: ResolveWhatsappAskAttachmentsUseCase,
  ) {}

  async execute(
    question: string,
    userId: string,
    scope: RunAskAiScope = {},
    conversationId?: string | null,
    conversationHistory?: AskConversationTurn[],
  ) {
    const projectId = scope.projectId || null;
    const workspaceId = scope.workspaceId || null;
    const resolvedConversationId = conversationId || crypto.randomUUID();

    let resolvedHistory = conversationHistory;
    if ((!resolvedHistory || resolvedHistory.length === 0) && conversationId) {
      const turns = await this.askHistoryRepository.getConversationTurns(conversationId, userId);
      if (turns && turns.length > 0) {
        resolvedHistory = toAskConversationTurns(turns);
      }
    }

    const result = await this.askKnowledge.execute(question, userId, {
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      conversationHistory: resolvedHistory,
    });
    const media: WhatsappAskAttachmentMedia[] = [];
    if (result.ok) {
      await this.askHistoryRepository.save(
        toSaveAskHistoryInput({
          userId,
          projectId,
          workspaceId,
          conversationId: resolvedConversationId,
          question,
          result,
        }),
      );

      if (result.requestedAttachments) {
        const workspaces = await this.contentRepository.listWorkspaces(userId);
        const workspace = (workspaceId
          ? workspaces.find((item) => item.id === workspaceId)
          : workspaces.find((item) => item.workspaceSlug === 'default')) || workspaces[0];
        const resolvedWorkspaceId = workspace?.id || '';

        const attachmentResolution = await this.resolveWhatsappAskAttachmentsUseCase.execute({
          userId,
          workspaceId: resolvedWorkspaceId,
          requestedAttachments: result.requestedAttachments,
          requestedAttachmentPattern: result.requestedAttachmentPattern,
          sources: result.sources,
          relatedNotes: result.relatedNotes,
        });

        if (attachmentResolution.requested && attachmentResolution.media.length > 0) {
          media.push(...attachmentResolution.media);
        }
      }
    }
    return {
      ...result,
      conversationId: resolvedConversationId,
      media,
    };
  }
}
