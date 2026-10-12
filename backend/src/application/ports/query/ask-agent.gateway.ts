import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import type { AnswerGenerationConfig, AnswerGenerationResponse } from './answer-generation.gateway.js';

export type AskAgentToolParameter = {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
};

export type AskAgentTool = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AskAgentToolParameter>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<unknown>;
};

export type AskAgentRequest = {
  question: string;
  conversationHistory?: AskConversationTurn[];
  workspaceId?: string;
  projectId?: string;
};

export type TrackedNoteSource = {
  noteId: string;
  title: string;
  path: string;
  projectSlug?: string;
  workspaceSlug?: string;
};

export abstract class AskAgentGateway {
  abstract run(
    config: AnswerGenerationConfig,
    request: AskAgentRequest,
    tools: AskAgentTool[],
  ): Promise<AnswerGenerationResponse | null>;
}
