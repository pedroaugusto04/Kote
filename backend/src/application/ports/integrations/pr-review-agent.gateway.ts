import type { AgentTool } from '../../../contracts/agent-tool.js';
import type { PrReviewAgentDecision } from '../../../contracts/pr-review-agent.js';

export type PrReviewAgentConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTurns?: number;
};

export type PrReviewAgentRequest = {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prDescription: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  changedFiles: Array<{ filename: string; status: string; patch: string }>;
};

export abstract class PrReviewAgentGateway {
  abstract run(
    config: PrReviewAgentConfig,
    request: PrReviewAgentRequest,
    tools: AgentTool[],
  ): Promise<PrReviewAgentDecision | null>;
}
