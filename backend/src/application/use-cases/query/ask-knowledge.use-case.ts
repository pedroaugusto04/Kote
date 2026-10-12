import { ConversationConfidence } from '../../../contracts/enums.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';

export type AskKnowledgeResult = {
  ok: boolean;
  answer: string;
  confidence: ConversationConfidence;
  requestedAttachments: boolean;
  requestedAttachmentPattern?: string;
  sources: Array<{ noteId: string; title: string; path: string }>;
  relatedNotes: Array<{
    id: string;
    title: string;
    path: string;
    projectSlug?: string;
    workspaceSlug?: string;
  }>;
};

export type AskKnowledgeOptions = {
  workspaceId?: string;
  projectId?: string;
  conversationHistory?: AskConversationTurn[];
};

export abstract class AskKnowledgeUseCase {
  abstract execute(
    question: string,
    userId: string,
    options?: AskKnowledgeOptions,
  ): Promise<AskKnowledgeResult>;

  protected resolveWorkspaceSlug(
    workspaces: Array<{ id: string; workspaceSlug: string }>,
    workspaceId?: string,
  ): string {
    const matched = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined;
    return matched?.workspaceSlug || workspaces[0]?.workspaceSlug || 'default';
  }
}
