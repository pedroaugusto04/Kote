import type { AgentConversationDraft, ConversationAgentDecision } from '../../../contracts/agent-conversation.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';
import type { RuntimeEnvironment } from '../observability/runtime-environment.port.js';

export type IngestAgentRequest = {
  messageText: string;
  workspaceSlug: string;
  candidateProjectSlug?: string;
  timeZone: string;
  timeZoneOffset?: string;
  currentLocalDate: string;
  currentLocalTime: string;
  recentTurns?: Array<{
    userMessage: string;
    agentReply: string;
  }>;
  pendingClarification?: {
    originalRequest: string;
    question: string;
    draft: AgentConversationDraft;
    projectSlug?: string;
    selectedFolderId?: string;
    suggestedFolderPath?: string[];
  };
};

export abstract class IngestAgentGateway {
  abstract decide(
    config: Pick<RuntimeEnvironment, 'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'>,
    request: IngestAgentRequest,
    tools: AgentTool[],
  ): Promise<ConversationAgentDecision | null>;
}
