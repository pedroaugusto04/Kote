import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { AskKnowledgeUseCase } from './ask-knowledge.use-case.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ResolveWhatsappAskAttachmentsUseCase } from './resolve-whatsapp-ask-attachments.use-case.js';
import { WhatsappReplySender } from '../../ports/integrations/whatsapp-reply.sender.js';

@Injectable()
export class RunAskAiUseCase {
  constructor(
    private readonly askKnowledge: AskKnowledgeUseCase,
    private readonly askHistoryRepository: AskHistoryRepository,
    private readonly contentRepository: ContentRepository,
    private readonly resolveWhatsappAskAttachmentsUseCase: ResolveWhatsappAskAttachmentsUseCase,
    private readonly whatsappReplySender: WhatsappReplySender,
  ) {}

  async execute(question: string, userId: string, options: { projectSlug?: string; workspaceSlug?: string } = {}) {
    const result = await this.askKnowledge.execute(question, userId, {
      projectSlug: options.projectSlug,
      workspaceSlug: options.workspaceSlug,
    });
    if (result.ok) {
      await this.askHistoryRepository.save({
        userId,
        projectSlug: options.projectSlug || '',
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        relatedNotes: result.relatedNotes,
      });

      if (result.requestedAttachments) {
        const workspaceSlug = options.workspaceSlug || 'default';
        const workspaces = await this.contentRepository.listWorkspaces(userId);
        const workspace = workspaces.find((item) => item.workspaceSlug === workspaceSlug) || workspaces[0];
        const chatJid = String(workspace?.whatsappChatJid || '').trim();

        if (chatJid) {
          const attachmentResolution = await this.resolveWhatsappAskAttachmentsUseCase.execute({
            userId,
            workspaceSlug: workspace?.workspaceSlug || workspaceSlug,
            requestedAttachments: result.requestedAttachments,
            requestedAttachmentPattern: result.requestedAttachmentPattern,
            sources: result.sources,
            relatedNotes: result.relatedNotes,
          });

          if (attachmentResolution.requested && attachmentResolution.media.length > 0) {
            for (const media of attachmentResolution.media) {
              await this.whatsappReplySender.sendMedia({
                chatJid,
                mediaType: media.mediaType,
                mimeType: media.mimeType,
                fileName: media.fileName,
                mediaBase64: media.mediaBase64,
              });
            }
          }
        }
      }
    }
    return result;
  }
}
