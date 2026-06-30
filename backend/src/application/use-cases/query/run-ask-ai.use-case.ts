import { Injectable } from '@nestjs/common';

import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { AskKnowledgeUseCase } from './ask-knowledge.use-case.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ResolveWhatsappAskAttachmentsUseCase } from './resolve-whatsapp-ask-attachments.use-case.js';
import { WhatsappReplySender } from '../../ports/integrations/whatsapp-reply.sender.js';
import { ConversationConfidence } from '../../../contracts/enums.js';

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
    let projectId: string | null = null;
    let workspaceId: string | null = null;

    if (options.projectSlug) {
      const project = await this.contentRepository.getProjectBySlug(userId, options.projectSlug);
      if (!project) {
        return emptyAskResult();
      }
      projectId = project.id;
      workspaceId = project.workspaceId;
    } else if (options.workspaceSlug) {
      const workspace = await this.contentRepository.getWorkspaceBySlug(userId, options.workspaceSlug);
      if (!workspace) {
        return emptyAskResult();
      }
      workspaceId = workspace.id;
    }

    const result = await this.askKnowledge.execute(question, userId, {
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
    });
    const media: any[] = [];
    if (result.ok) {
      await this.askHistoryRepository.save({
        userId,
        projectId,
        workspaceId,
        question,
        answer: result.answer,
        confidence: result.confidence as ConversationConfidence,
        sources: result.sources,
        relatedNotes: result.relatedNotes,
      });

      if (result.requestedAttachments) {
        const workspaceSlug = options.workspaceSlug || 'default';
        const workspaces = await this.contentRepository.listWorkspaces(userId);
        const workspace = workspaces.find((item: { workspaceSlug: string }) => item.workspaceSlug === workspaceSlug) || workspaces[0];
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
      media,
    };
  }
}


function emptyAskResult() {
  return {
    ok: true as const,
    answer: 'No relevant information found in your Kote.',
    confidence: ConversationConfidence.Low,
    requestedAttachments: false as const,
    sources: [],
    relatedNotes: [],
    media: [],
  };
}
