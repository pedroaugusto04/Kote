import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { AskKnowledgeUseCase } from './ask-knowledge.use-case.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ResolveWhatsappAskAttachmentsUseCase } from './resolve-whatsapp-ask-attachments.use-case.js';
import { WhatsappReplySender } from '../../ports/integrations/whatsapp-reply.sender.js';
import { ConversationConfidence } from '../../../contracts/enums.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';

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
    private readonly whatsappReplySender: WhatsappReplySender,
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

    const result = await this.askKnowledge.execute(question, userId, {
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      conversationHistory,
    });
    const media: any[] = [];
    if (result.ok) {
      await this.askHistoryRepository.save({
        userId,
        projectId,
        workspaceId,
        conversationId: resolvedConversationId,
        question,
        answer: result.answer,
        confidence: result.confidence as ConversationConfidence,
        sources: result.sources,
        relatedNotes: result.relatedNotes,
      });

      if (result.requestedAttachments) {
        const workspaces = await this.contentRepository.listWorkspaces(userId);
        const workspace = (workspaceId
          ? workspaces.find((item) => item.id === workspaceId)
          : workspaces.find((item) => item.workspaceSlug === 'default')) || workspaces[0];
        const chatJid = String(workspace?.whatsappChatJid || '').trim();
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

          if (chatJid) {
            for (const item of attachmentResolution.media) {
              await this.whatsappReplySender.sendMedia({
                chatJid,
                mediaType: item.mediaType,
                mimeType: item.mimeType,
                fileName: item.fileName,
                mediaBase64: item.mediaBase64,
              });
            }
          }
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
