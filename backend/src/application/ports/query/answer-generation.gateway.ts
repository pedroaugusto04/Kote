import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import type { RuntimeEnvironment } from '../observability/runtime-environment.port.js';
import { ConversationConfidence } from '../../../contracts/enums.js';

export type AnswerGenerationConfig = Pick<
  RuntimeEnvironment,
  'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'
>;

export type AnswerContextChunk = {
  noteId: string;
  title: string;
  path: string;
  projectSlug?: string;
  workspaceId?: string;
  chunkText: string;
};

export type AnswerGenerationRequest = {
  question: string;
  context: AnswerContextChunk[];
  conversationHistory?: AskConversationTurn[];
};

export type AnswerGenerationResponse = {
  answer: string;
  confidence: ConversationConfidence;
  requestedAttachments: boolean;
  requestedAttachmentPattern?: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
};

export type PrContextAiConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export abstract class AnswerGenerationGateway {
  abstract generate(
    config: AnswerGenerationConfig,
    payload: AnswerGenerationRequest,
  ): Promise<AnswerGenerationResponse | null>;

  abstract rewriteQuery(
    config: AnswerGenerationConfig,
    question: string,
    history: AskConversationTurn[],
  ): Promise<string>;

  abstract generatePullRequestComment(
    config: PrContextAiConfig,
    payload: {
      prTitle: string;
      prDescription: string;
      changedFiles: string[];
      context: AnswerContextChunk[];
    },
  ): Promise<string | null>;
}
