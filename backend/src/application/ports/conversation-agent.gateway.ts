import type { AgentConversationDraft, AgentConversationState, ConversationAgentDecision } from '../../contracts/agent-conversation.js';
import type { RuntimeEnvironment } from './runtime-environment.port.js';

export type ConversationAgentProjectContext = {
  projectSlug: string;
  displayName: string;
  aliases: string[];
  defaultTags: string[];
};

export type ConversationAgentFolderContext = {
  id: string;
  displayName: string;
  fullSlugPath: string;
  children: ConversationAgentFolderContext[];
};

export type ConversationAgentRequest = {
  messageText: string;
  currentState: AgentConversationState;
  availableProjects: ConversationAgentProjectContext[];
  candidateProjectSlug: string;
  candidateFolders: ConversationAgentFolderContext[];
  timeZone: string;
  currentLocalDate: string;
  currentLocalTime: string;
};

export type ConversationAgentResponse = ConversationAgentDecision & {
  resolvedDraft: AgentConversationDraft;
};

export abstract class ConversationAgentGateway {
  abstract decide(
    config: Pick<RuntimeEnvironment, 'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'>,
    payload: ConversationAgentRequest,
  ): Promise<ConversationAgentResponse | null>;
}
