import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import type { AgentTool, AgentToolParameter } from '../../../contracts/agent-tool.js';
import type { AnswerGenerationConfig, AnswerGenerationResponse } from './answer-generation.gateway.js';

export type { AgentTool, AgentToolParameter };
export type AskAgentTool = AgentTool;
export type AskAgentToolParameter = AgentToolParameter;

export type AskAgentRequest = {
  question: string;
  conversationHistory?: AskConversationTurn[];
  workspaceId?: string;
  workspaceSlug?: string;
  projectId?: string;
  projectSlug?: string;
  currentLocalDate?: string;
  currentLocalTime?: string;
  timeZone?: string;
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
