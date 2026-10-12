import type { ConversationAgentDecision } from '../../../contracts/agent-conversation.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';
import type { RuntimeEnvironment } from '../observability/runtime-environment.port.js';

export type IngestAgentRequest = {
  messageText: string;
  workspaceSlug: string;
  candidateProjectSlug?: string;
  timeZone: string;
  currentLocalDate: string;
  currentLocalTime: string;
};

export abstract class IngestAgentGateway {
  abstract decide(
    config: Pick<RuntimeEnvironment, 'conversationAiProvider' | 'conversationAiBaseUrl' | 'conversationAiModel' | 'conversationAiApiKey'>,
    request: IngestAgentRequest,
    tools: AgentTool[],
  ): Promise<ConversationAgentDecision | null>;
}
