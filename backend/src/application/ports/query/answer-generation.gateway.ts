import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import type { RuntimeEnvironment } from '../observability/runtime-environment.port.js';

export type AnswerGenerationConfig = Pick<
  RuntimeEnvironment,
  'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'
>;

export type AnswerContextChunk = {
  noteId: string;
  title: string;
  path: string;
  projectSlug?: string;
  workspaceSlug?: string;
  chunkText: string;
};

export type AnswerGenerationRequest = {
  question: string;
  context: AnswerContextChunk[];
  conversationHistory?: AskConversationTurn[];
};

export type AnswerGenerationResponse = {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  requestedAttachments: boolean;
  requestedAttachmentPattern?: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
};

export abstract class AnswerGenerationGateway {
  abstract generate(
    config: AnswerGenerationConfig,
    payload: AnswerGenerationRequest,
  ): Promise<AnswerGenerationResponse | null>;
}
